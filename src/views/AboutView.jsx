// Vista de informació sobre El Bon Diari (/sobre, /quisom)

import PageHero from '../components/PageHero.jsx'
import { canInterceptNavigation } from '../lib/navigation.js'

export function AboutView({ onNavigate }) {
  return (
    <>
      <PageHero
        tag="Qui hi ha darrere"
        title="El Bon Diari és un diari editorial petit i obert."
        description="Aquesta pàgina explica qui hi ha darrere, com es trien les notícies, què es recull sobre tu i amb quina llicència es publica."
      />

      <article className="section-block about-block">
        <section className="about-block__section">
          <h2>Qui hi ha darrere</h2>
          <p>
            El Bon Diari el porta{' '}
            <a
              href="https://sergicastillo.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              Sergi Castillo
            </a>
            , filòsof i editor. Concepte, selecció editorial, disseny i
            manteniment són responsabilitat seva. Per a qualsevol consulta o
            suggeriment de notícia, pots escriure a{' '}
            <a href="mailto:sergicas@gmail.com">sergicas@gmail.com</a>.
          </p>
        </section>

        <section className="about-block__section">
          <h2>Quin criteri segueix</h2>
          <p>
            Aquí entren històries constructives, verificacions i informació
            pràctica amb fonts transparents. Cada peça ha d’aportar evidència,
            context o una acció útil; no hi ha optimisme buit ni opinió per
            opinar. Si vols veure el marc complet, llegeix el{' '}
            <a
              href="/manifest"
              onClick={(event) => {
                if (!canInterceptNavigation(event) || !onNavigate) return
                event.preventDefault()
                onNavigate('/manifest')
              }}
            >
              Manifest editorial
            </a>
            .
          </p>
        </section>

        <section className="about-block__section">
          <h2>Què recollim sobre tu</h2>
          <p>
            <strong>El menys possible.</strong> El Bon Diari no usa cookies de
            seguiment ni serveis d’analítica externs (no hi ha Google Analytics,
            Facebook Pixel, AdSense ni similars). Tampoc demana cap dada
            personal per llegir.
          </p>
          <p>
            Comptem visites amb un comptador propi i agregat: cada visita es
            converteix en una xifra anònima al servidor (pàgina, dispositiu i
            origen aproximat). No es desa cap identificador, IP ni perfil de
            lector. Aquestes xifres no surten d’El Bon Diari ni es venen a
            ningú. Si ets propietari, pots veure-les al{' '}
            <a
              href="/estadistiques"
              onClick={(event) => {
                if (!canInterceptNavigation(event) || !onNavigate) return
                event.preventDefault()
                onNavigate('/estadistiques')
              }}
            >
              panell d’estadístiques
            </a>
            .
          </p>
          <p>
            Si vols excloure’t del comptador al teu navegador, obre el panell
            d’estadístiques una vegada: el botó “Exclou-me del comptador” deixa
            una marca local i les teves visites deixen de comptar.
          </p>
        </section>

        <section className="about-block__section">
          <h2>Llicència del contingut</h2>
          <p>
            Les peces editorials d’El Bon Diari es publiquen sota llicència{' '}
            <a
              href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.ca"
              target="_blank"
              rel="noopener noreferrer"
            >
              Creative Commons BY-NC-SA 4.0
            </a>
            : pots reutilitzar-les si en cites l’autoria, no en fas un ús
            comercial i compartides amb la mateixa llicència.
          </p>
          <p>
            Les fonts enllaçades pertanyen als mitjans originals i mantenen la
            seva pròpia llicència. Les il·lustracions de les peces són creacions
            editorials pròpies generades per a El Bon Diari; no es reutilitzen
            fotografies de premsa de tercers.
          </p>
        </section>

        <section className="about-block__section">
          <h2>Tecnologia</h2>
          <p>
            Web feta amb React + Vite i executada a Cloudflare Workers, publicada
            des de Tarragona. Codi obert i editable: si trobes un error, una
            millora d’accessibilitat o una peça que ens hauria
            d’interessar, escriu-nos.
          </p>
        </section>
      </article>
    </>
  )
}

export default AboutView
