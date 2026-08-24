// Vista de Privacitat d'El Bon Diari (/privacitat)

import PageHero from '../components/PageHero.jsx'
import { canInterceptNavigation } from '../lib/navigation.js'

export function PrivacyView({ onNavigate }) {
  return (
    <>
      <PageHero
        tag="Privacitat"
        title="Política de privacitat"
        description="Què recollim, per què i com pots controlar-ho. En resum: el mínim imprescindible, sense seguiment publicitari ni venda de dades."
      />

      <article className="section-block about-block">
        <section className="about-block__section">
          <p>
            <strong>Última actualització: 24 d’agost de 2026.</strong>
          </p>
          <p>
            El Bon Diari (bondiari.com) i l’app «El Bon Diari» són un projecte
            editorial de <strong>Sergi Castillo</strong>, responsable del
            tractament de dades. Per a qualsevol qüestió de privacitat pots
            escriure a{' '}
            <a href="mailto:sergicas@gmail.com">sergicas@gmail.com</a>. Aquesta
            política s’aplica igual al web i a l’app d’iOS.
          </p>
        </section>

        <section className="about-block__section">
          <h2>Llegir no requereix cap dada</h2>
          <p>
            Pots llegir El Bon Diari, al web o a l’app, sense registrar-te ni
            facilitar cap dada personal. No usem cookies de seguiment ni serveis
            d’analítica de tercers: no hi ha Google Analytics, Meta Pixel,
            AdSense ni similars, ni al web ni a l’app.
          </p>
        </section>

        <section className="about-block__section">
          <h2>Comptador de visites (anònim i agregat)</h2>
          <p>
            Comptem visites amb un comptador propi. Cada visita es converteix en
            una xifra anònima al servidor (pàgina, tipus de dispositiu i origen
            aproximat). <strong>No desem cap identificador, adreça IP ni perfil
            de lector</strong>, i aquestes xifres no surten d’El Bon Diari ni es
            venen a ningú. Per excloure’t al teu navegador, obre el{' '}
            <a
              href="/estadistiques"
              onClick={(event) => {
                if (!canInterceptNavigation(event) || !onNavigate) return
                event.preventDefault()
                onNavigate('/estadistiques')
              }}
            >
              panell d’estadístiques
            </a>{' '}
            i prem «Exclou-me del comptador».
          </p>
        </section>

        <section className="about-block__section">
          <h2>Butlletí (newsletter)</h2>
          <p>
            Si t’hi subscrius voluntàriament, guardem la teva{' '}
            <strong>adreça de correu</strong> i l’idioma escollit amb l’únic
            objectiu d’enviar-te la selecció editorial. No la compartim ni
            la venem. Pots donar-te de baixa en qualsevol moment amb l’enllaç del
            peu de cada correu, o escrivint-nos. L’enviament el gestiona el
            proveïdor de correu Resend i les adreces es desen a la
            infraestructura de Cloudflare.
          </p>
        </section>

        <section className="about-block__section">
          <h2>Notificacions push</h2>
          <p>
            Si actives les notificacions, <strong>el servidor guarda només la
            subscripció de l’aparell i l’opció triada</strong>: «La peça del dia»
            o «Desactivades». Al web és una subscripció Web Push i a l’app un
            «device token» d’Apple (APNs). Aquest testimoni{' '}
            <strong>no ens identifica personalment</strong> i no s’associa a cap
            nom, correu ni historial de lectura. Per garantir el màxim d’un avís
            diari, conservem durant vuit dies només el dia, el canal i una
            empremta irreversible del dispositiu; no permet reconstruir el
            testimoni. Pots desactivar
            els avisos des d’«Els meus interessos»: la baixa esborra la
            subscripció del servidor. També eliminem els testimonis que Apple o
            el navegador indiquen que ja no són vàlids.
          </p>
        </section>

        <section className="about-block__section">
          <h2>Emmagatzematge local al dispositiu</h2>
          <p>
            Fem servir l’emmagatzematge local del navegador o de l’app només per
            recordar preferències teves (temes i territoris d’interès, mida de
            lletra, llegibilitat, exclusió del comptador o estat dels avisos).
            Els interessos de lectura es queden al teu dispositiu i no s’envien
            enlloc.
          </p>
        </section>

        <section className="about-block__section">
          <h2>Amb qui es comparteix</h2>
          <p>
            Només amb els proveïdors tècnics imprescindibles per fer funcionar el
            servei, com a encarregats del tractament:{' '}
            <strong>Cloudflare</strong> (allotjament, base de dades i enviament de
            notificacions), <strong>Resend</strong> (enviament del butlletí) i,
            per a l’app, <strong>Apple</strong> (lliurament de les notificacions
            push). No venem, lloguem ni cedim dades a tercers amb finalitats
            publicitàries.
          </p>
        </section>

        <section className="about-block__section">
          <h2>Conservació</h2>
          <p>
            Conservem la teva adreça del butlletí mentre segueixis subscrit; si
            et dones de baixa, la deixem d’utilitzar i l’eliminem. Els testimonis
            de notificacions es conserven mentre estiguin actius i s’eliminen quan
            caduquen o desactives les notificacions. Les xifres del comptador són
            anònimes i agregades des de l’origen.
          </p>
        </section>

        <section className="about-block__section">
          <h2>Els teus drets</h2>
          <p>
            Pots demanar accés, rectificació o supressió de les teves dades, i
            oposar-te’n al tractament, escrivint a{' '}
            <a href="mailto:sergicas@gmail.com">sergicas@gmail.com</a>. Com que no
            desem perfils ni identificadors dels lectors, la majoria de dades es
            limiten al correu del butlletí i als testimonis de notificacions, que
            pots eliminar tu mateix donant-te de baixa o desactivant-les.
          </p>
        </section>

        <section className="about-block__section">
          <h2>Menors</h2>
          <p>
            El Bon Diari és un servei de notícies d’interès general, no dirigit
            específicament a menors, i no recull dades conscientment de menors
            d’edat.
          </p>
        </section>

        <section className="about-block__section">
          <h2>Canvis en aquesta política</h2>
          <p>
            Si actualitzem aquesta política, en canviarem la data d’aquesta
            pàgina. Els canvis rellevants es comunicaran pels canals habituals
            d’El Bon Diari.
          </p>
        </section>
      </article>
    </>
  )
}

export default PrivacyView
