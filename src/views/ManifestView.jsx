// Vista del Manifest Editorial (/manifest)

import PageHero from '../components/PageHero.jsx'
import ManifestSection from '../components/ManifestSection.jsx'
import SourcesManifest from '../components/SourcesManifest.jsx'

export function ManifestView() {
  return (
    <>
      <PageHero
        tag="Manifest editorial"
        title="Una mirada constructiva necessita evidència, utilitat i límits."
        description="Aquest és el marc amb què El Bon Diari tria solucions, verificacions i informació pràctica, i explica quin valor té per a qui ho llegeix."
      />
      <ManifestSection />
      <SourcesManifest />
    </>
  )
}

export default ManifestView
