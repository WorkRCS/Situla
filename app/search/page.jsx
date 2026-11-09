import SitulaApp from "../components/situla-app";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }) {
  const params = await searchParams;
  const query = typeof params?.q === "string" ? params.q.slice(0, 120) : "";
  return <SitulaApp key={"search-" + query} view="search" initialQuery={query} />;
}
