import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import draco3d from "draco3d";
import { Matrix4, Quaternion, Vector3 } from "three";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WIDTH = 6400;
const HEIGHT = 3200;
const SOURCE_WIDTH = 640;
const SOURCE_HEIGHT = 320;
const SCALE_X = WIDTH / SOURCE_WIDTH;
const SCALE_Y = HEIGHT / SOURCE_HEIGHT;

const PROJECT_ROOT = path.resolve(__dirname, "..");
const SOURCE_PATH = path.join(PROJECT_ROOT, "public", "Ground_optimize.glb");
const GRID_PATH = path.join(PROJECT_ROOT, "public", "Ground_optimize.grid.bin");
const META_PATH = path.join(PROJECT_ROOT, "public", "Ground_optimize.grid.json");

function readGlb(filePath) {
  const file = fs.readFileSync(filePath);
  if (file.toString("ascii", 0, 4) !== "glTF") throw new Error("입력 파일이 GLB 형식이 아닙니다.");

  const jsonLength = file.readUInt32LE(12);
  const json = JSON.parse(file.subarray(20, 20 + jsonLength).toString("utf8"));
  const binHeaderOffset = 20 + jsonLength;
  if (file.readUInt32LE(binHeaderOffset + 4) !== 0x004e4942) throw new Error("GLB에서 BIN 청크를 찾지 못했습니다.");

  return { file, json, binStart: binHeaderOffset + 8 };
}

function getNodeMatrix(node) {
  if (node.matrix) return new Matrix4().fromArray(node.matrix);

  return new Matrix4().compose(
    new Vector3(...(node.translation ?? [0, 0, 0])),
    new Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
    new Vector3(...(node.scale ?? [1, 1, 1])),
  );
}

function collectSceneNodes(json) {
  const collected = [];

  function visit(nodeIndex, parentMatrix, inheritedStone) {
    const node = json.nodes[nodeIndex];
    const worldMatrix = parentMatrix.clone().multiply(getNodeMatrix(node));
    const isStone = inheritedStone || /^stone/i.test(node.name ?? "");
    collected.push({ node, worldMatrix, isStone });
    for (const childIndex of node.children ?? []) visit(childIndex, worldMatrix, isStone);
  }

  const scene = json.scenes[json.scene ?? 0];
  for (const nodeIndex of scene.nodes ?? []) visit(nodeIndex, new Matrix4(), false);
  return collected;
}

function markCell(grid, x, y) {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  if (cellX >= 0 && cellX < WIDTH && cellY >= 0 && cellY < HEIGHT) grid[cellY * WIDTH + cellX] = 1;
}

function rasterizeEdge(grid, ax, ay, bx, by) {
  const deltaX = bx - ax;
  const deltaY = by - ay;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(deltaX), Math.abs(deltaY))));

  for (let step = 0; step <= steps; step += 1) {
    const amount = step / steps;
    markCell(grid, ax + deltaX * amount, ay + deltaY * amount);
  }
}

function edge(ax, ay, bx, by, px, py) {
  return (px - ax) * (by - ay) - (py - ay) * (bx - ax);
}

function rasterizeTriangle(grid, ax, ay, bx, by, cx, cy) {
  rasterizeEdge(grid, ax, ay, bx, by);
  rasterizeEdge(grid, bx, by, cx, cy);
  rasterizeEdge(grid, cx, cy, ax, ay);

  const signedArea = edge(ax, ay, bx, by, cx, cy);
  if (Math.abs(signedArea) < 1e-7) return;

  const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const maxX = Math.min(WIDTH - 1, Math.ceil(Math.max(ax, bx, cx)));
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const maxY = Math.min(HEIGHT - 1, Math.ceil(Math.max(ay, by, cy)));
  if (minX > maxX || minY > maxY) return;

  const positive = signedArea > 0;
  for (let y = minY; y <= maxY; y += 1) {
    const pointY = y + 0.5;
    const rowOffset = y * WIDTH;
    for (let x = minX; x <= maxX; x += 1) {
      const pointX = x + 0.5;
      const first = edge(ax, ay, bx, by, pointX, pointY);
      const second = edge(bx, by, cx, cy, pointX, pointY);
      const third = edge(cx, cy, ax, ay, pointX, pointY);
      const inside = positive ? first >= 0 && second >= 0 && third >= 0 : first <= 0 && second <= 0 && third <= 0;
      if (inside) grid[rowOffset + x] = 1;
    }
  }
}

async function main() {
  const { file, json, binStart } = readGlb(SOURCE_PATH);
  const decoderModule = await draco3d.createDecoderModule({});
  const decoder = new decoderModule.Decoder();
  const grid = new Uint8Array(WIDTH * HEIGHT);
  const stoneMeshes = [];
  let triangleCount = 0;

  try {
    for (const { node, worldMatrix, isStone } of collectSceneNodes(json)) {
      if (!isStone || node.mesh === undefined) continue;
      stoneMeshes.push(node.name ?? `mesh-${node.mesh}`);

      for (const primitive of json.meshes[node.mesh].primitives ?? []) {
        const draco = primitive.extensions?.KHR_draco_mesh_compression;
        if (!draco) throw new Error(`${node.name ?? node.mesh} 메시가 Draco 압축 형식이 아닙니다.`);

        const bufferView = json.bufferViews[draco.bufferView];
        const byteOffset = binStart + (bufferView.byteOffset ?? 0);
        const compressed = file.subarray(byteOffset, byteOffset + bufferView.byteLength);
        const decoderBuffer = new decoderModule.DecoderBuffer();
        const mesh = new decoderModule.Mesh();
        const positionValues = new decoderModule.DracoFloat32Array();
        const face = new decoderModule.DracoInt32Array();

        try {
          decoderBuffer.Init(new Int8Array(compressed.buffer, compressed.byteOffset, compressed.byteLength), compressed.byteLength);
          const status = decoder.DecodeBufferToMesh(decoderBuffer, mesh);
          if (!status.ok()) throw new Error(status.error_msg());

          const positionAttribute = decoder.GetAttributeByUniqueId(mesh, draco.attributes.POSITION);
          decoder.GetAttributeFloatForAllPoints(mesh, positionAttribute, positionValues);
          const projected = new Float64Array(mesh.num_points() * 2);
          const vertex = new Vector3();

          for (let pointIndex = 0; pointIndex < mesh.num_points(); pointIndex += 1) {
            const valueOffset = pointIndex * 3;
            vertex
              .set(
                positionValues.GetValue(valueOffset),
                positionValues.GetValue(valueOffset + 1),
                positionValues.GetValue(valueOffset + 2),
              )
              .applyMatrix4(worldMatrix);
            projected[pointIndex * 2] = vertex.x * SCALE_X;
            projected[pointIndex * 2 + 1] = -vertex.z * SCALE_Y;
          }

          for (let faceIndex = 0; faceIndex < mesh.num_faces(); faceIndex += 1) {
            decoder.GetFaceFromMesh(mesh, faceIndex, face);
            const first = face.GetValue(0) * 2;
            const second = face.GetValue(1) * 2;
            const third = face.GetValue(2) * 2;
            rasterizeTriangle(
              grid,
              projected[first],
              projected[first + 1],
              projected[second],
              projected[second + 1],
              projected[third],
              projected[third + 1],
            );
            triangleCount += 1;
          }
        } finally {
          decoderModule.destroy(face);
          decoderModule.destroy(positionValues);
          decoderModule.destroy(mesh);
          decoderModule.destroy(decoderBuffer);
        }
      }
    }
  } finally {
    decoderModule.destroy(decoder);
  }

  let stoneCellCount = 0;
  for (const value of grid) stoneCellCount += value;

  const temporaryGridPath = `${GRID_PATH}.tmp`;
  fs.writeFileSync(temporaryGridPath, Buffer.from(grid.buffer, grid.byteOffset, grid.byteLength));
  fs.renameSync(temporaryGridPath, GRID_PATH);

  const metadata = {
    source: path.relative(PROJECT_ROOT, SOURCE_PATH),
    data: path.basename(GRID_PATH),
    format: "uint8-row-major",
    width: WIDTH,
    height: HEIGHT,
    byteLength: grid.byteLength,
    indexFormula: "index = y * 6400 + x",
    values: { 0: "ground", 1: "stone" },
    sourceToGrid: { x: "sourceX * 10", y: "-sourceZ * 10" },
    stoneMeshes,
    triangleCount,
    stoneCellCount,
    groundCellCount: grid.length - stoneCellCount,
    stoneCoveragePercent: Number(((stoneCellCount / grid.length) * 100).toFixed(6)),
  };
  fs.writeFileSync(META_PATH, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(JSON.stringify(metadata, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
