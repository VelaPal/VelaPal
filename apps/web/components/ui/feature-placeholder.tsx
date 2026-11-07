type FeaturePlaceholderProps = {
  title: string;
  description: string;
};

export default function FeaturePlaceholder({
  title,
  description,
}: FeaturePlaceholderProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
        Preview · unavailable in P0
      </span>

      <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900">
        {title}
      </h1>

      <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
        {description}
      </p>
      <p className="mt-3 text-sm text-amber-800">
        This feature has no public endpoint in the frozen V6.1.1 P0 contract.
      </p>
    </section>
  );
}
