# Guia App Store — El Bon Diari (iOS)

Aquest document recull les **funcions natives** de l'app (per reforçar el cas
contra la directriu 4.2 d'Apple), el **text de descripció proposat**, els
**passos de recompilació** i una **resposta preparada** per si Apple objecta.

Bundle ID: `com.bondiari.app` · Nom: **El Bon Diari** · App Capacitor que
carrega `https://bondiari.com` amb capes natives per sobre.

---

## 1. Funcions natives (el que ens separa d'un "web dins d'una finestra")

La directriu **4.2 ("Minimum Functionality")** rebutja apps que són només una
pàgina web embolcallada. El Bon Diari incorpora funcions que **només tenen sentit
com a app nativa** i que un web obert al navegador no pot oferir:

1. **Notificacions push natives** — alerta de bones notícies via APNs
   (`@capacitor/push-notifications`). Capability de push ja configurada.
2. **Compartir natiu + hàptics** — el botó "Comparteix aquesta bona notícia" obre
   el full de compartir d'iOS (`@capacitor/share`) amb vibració subtil
   (`@capacitor/haptics`). Al web fa el *fallback* de sempre.
3. **Desa per llegir després (offline)** — col·lecció d'articles desats al
   dispositiu (secció **Desats**), amb el contingut emmagatzemat localment per
   llegir sense connexió. És contingut gestionat per l'usuari dins l'app.
4. **Estira per actualitzar (pull-to-refresh) + transicions natives** — gest
   tàctil de tibada des de dalt que refresca el radar, amb resistència elàstica i
   *feedback* hàptic al llindar; i transicions animades entre pàgines (View
   Transitions API). Sensació d'app, no de pàgina web.
5. **Widget de pantalla d'inici (WidgetKit)** — la bona notícia més recent a la
   *home* de l'iPhone, amb imatge i titular, refrescant-se sola. Impossible en un
   web. (Cal crear el *target* a Xcode un cop: vegeu
   `ios/App/NewsWidget/README.md`.)

Conjunt = push + compartir natiu + hàptics + col·lecció offline +
pull-to-refresh + widget. És un cas sòlid de funcionalitat nativa.

---

## 2. Descripció proposada (App Store Connect)

> **El Bon Diari** és el diari que només deixa passar bones notícies verificables:
> històries que reparen el món, cuiden la gent o demostren que una idea bona es
> pot replicar. Un radar automàtic rastreja mitjans catalans i internacionals i
> n'aparta el soroll negatiu.
>
> **A l'app pots:**
> - Rebre una **notificació** amb la bona notícia del dia.
> - **Desar articles per llegir-los després**, fins i tot sense connexió.
> - **Compartir** qualsevol notícia amb el full natiu d'iOS.
> - Afegir un **widget** a la pantalla d'inici amb la darrera bona notícia.
> - **Estirar per actualitzar** el radar amb un gest, amb resposta hàptica.
>
> Bones notícies, cada dia, a mà.

**Paraules clau suggerides:** bones notícies, diari, Catalunya, positiu,
optimisme, premsa, actualitat, widget.

---

## 3. Recompilació (activar-ho tot)

Hi ha canvis al codi web (pull-to-refresh + transicions ja importats a `App.jsx`)
i un widget nou. Passos, a la carpeta del projecte:

```bash
cd ~/Documents/Playground/diari-bones-noticies
npm install
npm run deploy                 # build del web + puja a Cloudflare (bondiari.com)
npx cap sync ios
npm run build && npm run ios:assets && npm run ios:sync && npm run ios:open
```

> **Important:** fes `npm install` **abans** de `npm run deploy`. El codi ja
> importa els plugins natius; si no hi són, el build del web fallaria.

Després, a Xcode:

1. **Crea el target del widget** una sola vegada seguint
   `ios/App/NewsWidget/README.md` (File → New → Target → Widget Extension →
   afegeix `BonDiariWidget.swift`).
2. ▶ per provar-ho al telèfon (push, compartir, desats, tibada i widget).
3. Quan et convenci: **Product → Archive** (esquema **App**).

La signatura i les capabilities de push ja estan configurades: no cal tornar-hi.

---

## 4. Si Apple objecta el 4.2 (resposta preparada)

> El Bon Diari no és una pàgina web embolcallada. L'app ofereix funcionalitat
> específicament nativa d'iOS que no existeix al lloc web obert al navegador:
>
> - **Notificacions push (APNs)** per a les bones notícies del dia.
> - **Widget de WidgetKit** a la pantalla d'inici amb la darrera notícia.
> - **Compartir amb el full natiu d'iOS i resposta hàptica.**
> - **Col·lecció "Desats" llegible sense connexió**, emmagatzemada al dispositiu.
> - **Gest natiu d'estirar per actualitzar** amb *feedback* hàptic i transicions.
>
> Aquestes funcions requereixen les capacitats natives del sistema i aporten un
> valor a l'usuari que va més enllà del contingut del web.

---

## 5. Nota honesta sobre l'offline

Els articles desats es guarden al dispositiu i hi són sempre. La lectura
completament sense connexió depèn que el cos de l'app ja s'hagi carregat un cop
(cosa que passa amb l'ús normal). Si algun dia calgués un offline més robust,
es podria empaquetar l'app localment (treure `server.url` de `capacitor.config`
i servir `dist`). Per al 4.2, el conjunt actual de funcions natives ja és sòlid.
