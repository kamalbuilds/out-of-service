export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-white dark:bg-black">
      <main className="flex flex-col items-center gap-4 px-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Out of Service
        </h1>
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
          NYC subway elevators, scored by their own outage history.
        </p>
      </main>
    </div>
  );
}
