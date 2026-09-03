import Link from "next/link";

export default function TripNotFound() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="signage text-5xl uppercase">No such trip</h1>
      <p className="mt-4 text-lg">
        That trip id is not in the store. Trips are created from the home page and live in the
        state store, not in the URL, so a link only works while the trip exists.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block border-2 border-ink px-4 py-2 font-bold uppercase tracking-wide hover:bg-ink hover:text-white"
      >
        Plan a trip
      </Link>
    </main>
  );
}
