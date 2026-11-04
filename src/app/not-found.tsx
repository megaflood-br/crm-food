import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="max-w-md text-center">
        <p className="font-display text-5xl text-ember">404</p>
        <h1 className="mt-2 font-display text-3xl">Essa página não está no cardápio.</h1>
        <Link href="/painel" className="mt-6 inline-flex rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">Voltar ao painel</Link>
      </div>
    </main>
  );
}
