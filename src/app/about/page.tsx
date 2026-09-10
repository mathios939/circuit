import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CircuitMark } from "@/components/layout/CircuitMark";

export const metadata: Metadata = {
  title: "À propos",
  description: "Ce que Circuit fait, d'où viennent les données, et ce qu'il faut vérifier avant de partir.",
};

/** /about — what Circuit is, where the data comes from, what it does not guarantee. */
export default function AboutPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-8 sm:py-12">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" /> Retour à l&apos;application
      </Link>

      <header className="mt-6 flex items-center gap-4">
        <CircuitMark size={56} />
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">Circuit</h1>
          <p className="text-sm text-ink-500">Choisissez la distance. Circuit trouve la route.</p>
        </div>
      </header>

      <section className="prose-sm mt-8 space-y-3 text-ink-700">
        <h2 className="font-display text-lg font-semibold text-ink-900">Ce que fait Circuit</h2>
        <p>
          Circuit génère des boucles et des itinéraires A → B pour le vélo de route, le gravel, le VTT, la course à pied, le trail, la randonnée et la marche. Vous
          indiquez un départ, une distance et une activité ; le moteur explore plusieurs directions sur le réseau routier réel, garde les propositions les plus
          qualitatives et vous en présente jusqu&apos;à trois, réellement différentes, avec distance, dénivelé, durée estimée, profil et fichier GPX.
        </p>
      </section>

      <section className="mt-8 space-y-3 text-ink-700">
        <h2 className="font-display text-lg font-semibold text-ink-900">D&apos;où viennent les données</h2>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Les routes, chemins et sentiers proviennent d&apos;<strong>OpenStreetMap</strong>, via un moteur de routing (Valhalla par défaut, GraphHopper, openrouteservice
            ou OSRM selon la configuration).
          </li>
          <li>Les altitudes proviennent d&apos;un modèle numérique de terrain (Open-Meteo, OpenTopoData ou Valhalla) ; le dénivelé est filtré pour ne pas compter le bruit du modèle.</li>
          <li>Les lieux sont recherchés via Photon ou Nominatim. Les fonds de carte sont fournis par OpenFreeMap ou MapTiler.</li>
        </ul>
      </section>

      <section className="mt-8 space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900" data-testid="about-disclaimer">
        <h2 className="font-display text-lg font-semibold">Avant de partir : à vérifier</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li>
            Les parcours sont <strong>indicatifs</strong>. Ils sont calculés automatiquement et n&apos;ont pas été reconnus sur le terrain.
          </li>
          <li>
            Les données OpenStreetMap peuvent être incomplètes ou obsolètes : un chemin peut être privé, fermé, impraticable ou dangereux. C&apos;est particulièrement vrai
            pour le <strong>VTT, le trail et la randonnée</strong>, où l&apos;existence et l&apos;accès légal d&apos;un sentier ne sont pas garantis.
          </li>
          <li>Vérifiez les conditions locales : météo, travaux, circulation, saison, horaires d&apos;accès, réglementation des espaces naturels.</li>
          <li>Durée, difficulté, Score Circuit et Route DNA sont des estimations destinées à comparer des propositions, pas des mesures.</li>
          <li>Vous restez responsable de votre sécurité et du respect des règles en vigueur sur le terrain.</li>
        </ul>
      </section>

      <section className="mt-8 space-y-3 text-ink-700">
        <h2 className="font-display text-lg font-semibold text-ink-900">Vos données</h2>
        <p>
          Circuit n&apos;a pas de compte utilisateur. Vos favoris et votre historique sont stockés dans votre navigateur uniquement. Un lien de partage contient la
          géométrie simplifiée du parcours ; ne le diffusez pas s&apos;il révèle votre domicile.
        </p>
      </section>

      <section className="mt-8 space-y-3 text-ink-700">
        <h2 className="font-display text-lg font-semibold text-ink-900">Logiciel libre</h2>
        <p>
          Le code source est disponible sur{" "}
          <a href="https://github.com/mathios939/circuit" className="text-brand-700 underline underline-offset-2" rel="noopener noreferrer">
            GitHub
          </a>
          . Les données cartographiques sont © les contributeurs OpenStreetMap (ODbL).
        </p>
      </section>
    </main>
  );
}
