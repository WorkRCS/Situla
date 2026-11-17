import SitulaApp from "./components/situla-app";

export const metadata = { title: "Cartoons" };

export default function HomePage() {
  return <SitulaApp key="cartoons-home" view="cartoons" />;
}
