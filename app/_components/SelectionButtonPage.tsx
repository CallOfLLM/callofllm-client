import CommandHeader from "./CommandHeader";

type SelectionItem = {
  label: string;
  eyebrow: string;
  description: string;
};

type SelectionButtonPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  items: SelectionItem[];
};

export default function SelectionButtonPage({ eyebrow, title, description, items }: SelectionButtonPageProps) {
  return (
    <main className="min-h-dvh bg-slate-950 text-white">
      <CommandHeader backHref="/main" backLabel="부대 관리" />

      <section className="mx-auto max-w-7xl px-6 py-10">
        <div>
          <p className="text-sm font-semibold tracking-[0.24em] text-sky-400">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-bold">{title}</h1>
          <p className="mt-3 text-slate-400">{description}</p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className="min-h-48 rounded-xl border border-white/10 bg-white/5 p-5 text-left transition hover:-translate-y-1 hover:border-sky-400/50 hover:bg-sky-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
            >
              <span className="text-sm font-semibold text-sky-400">{item.eyebrow}</span>
              <strong className="mt-5 block text-xl font-bold text-white">{item.label}</strong>
              <span className="mt-2 block text-sm leading-6 text-slate-400">{item.description}</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
