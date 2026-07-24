# Fase 4 (contraproposta) — Lectura a mida sense perdre la veu editorial

Substitueix la proposta original de «Personalització de Lectura, Preferències del
Lector i Notificacions Intel·ligents». Mateixa direcció de fons (privacitat,
calma, proximitat), amb tres correccions: la portada no es reordena mai, la
promesa de privacitat es diu amb honestedat, i cap funció no es dona per feta
fins que s'ha vist funcionar a bondiari.com.

Data: 24 de juliol de 2026 · Estat: proposta per aprovar

---

## Principis que governen tota la fase

1. **La portada és editorial.** El Bon Diari té veu d'editor: la jerarquia de la
   portada és la mateixa per a tothom. Les preferències del lector *destaquen*
   peces; mai no en canvien l'ordre ni n'amaguen cap.
2. **Privacitat honesta.** Tot es guarda al navegador del lector, amb una única
   excepció inevitable: per enviar notificacions, el servidor ha de guardar la
   subscripció de l'aparell i la freqüència triada (cap nom, cap correu, cap
   historial de lectura). Això es diu així, literalment, a la pàgina de
   Privacitat. Cap promesa de «100% privat» que no sigui certa al peu de la lletra.
3. **Res no està fet fins que s'ha vist.** Cada bloc acaba amb la funció
   comprovada a bondiari.com amb els ulls (i captura), no només amb el
   desplegament sortint verd. Lliçó de la Fase 3: el panell /diagnostic es va
   anunciar «actiu a producció» i no s'havia carregat mai.
4. **Frontera client/servidor intocable.** Cap vista del navegador no importa
   codi de `src/server/` (la prova de guàrdia `clientServerBoundary.test.js` ja
   ho vigila; la suite ha de continuar verda a cada bloc).

---

## Bloc 1 — Accessibilitat i ús educatiu

*(era el Pilar 4; passa primer perquè és el de més valor per esforç i el més
alineat amb la missió)*

### Feina

1. **Repassada d'accessibilitat prèvia** (abans de cap selector): contrastos de
   color en mode clar i fosc, navegació amb teclat, etiquetes dels formularis.
   Inclou corregir els colors fixats a mà del panell /diagnostic, que no
   respecten el mode fosc.
2. **Selector de mida de lletra** (3 graons) i **mode d'alta llegibilitat**
   (més interlineat, més contrast). Es guarda al navegador; funciona igual dins
   l'app d'iPhone.
3. **Impressió i exportació neta d'articles** per a escoles i tallers: full
   d'estil d'impressió que treu menús i decoració i deixa titular, resum, cos,
   font i data. El PDF el fa el navegador amb «Imprimir → Desar com a PDF»; no
   es construeix cap generador propi.

### Avantatge que cal explotar

Les il·lustracions i els resums són de producció pròpia (generats, no copiats
de mitjans): l'exportació per a aules no arrossega drets de tercers.

### Fet vol dir

- La lletra s'apuja i s'abaixa sense trencar cap vista (portada, peça, hemeroteca).
- Imprimir una peça dona una pàgina neta, sense navegació ni botons.
- Contrastos AA a les vistes principals, en clar i en fosc.
- Comprovat a bondiari.com en mòbil i escriptori, amb captures.

---

## Bloc 2 — «Els meus interessos», versió destacar

*(era el Pilar 1, amb la correcció editorial)*

### Feina

1. **Pàgina de preferències** (categories i territoris d'interès), guardades al
   navegador. Sense registre, sense enviar res al servidor.
2. **A la portada**: l'ordre editorial no es toca. Les peces que coincideixen
   amb els interessos reben un realç discret (marca visual), i opcionalment un
   bloc «Per a tu» de com a màxim 3-4 peces que *repeteix* seleccions de la
   portada — no n'hi afegeix de noves ni en treu cap.
3. **A l'hemeroteca**: els filtres que ja existeixen (font, idioma) s'amplien amb
   categoria/territori i surten preomplerts amb les preferències del lector.

### Fora d'abast (explícitament)

- Reordenar o filtrar la portada segons preferències. Mai.
- Qualsevol enviament de les preferències al servidor.

### Fet vol dir

- Un lector sense preferències veu la portada exactament igual que avui
  (comprovable comparant abans/després).
- Un lector amb preferències veu la mateixa portada amb realços i, si l'activa,
  el bloc «Per a tu».
- Funciona idèntic dins l'app d'iPhone (mateix navegador intern).

---

## Bloc 3 — Notificacions assenyades

*(era el Pilar 2, retallat i amb el jutge definit)*

### Feina

1. **Dues opcions, no tres**: «La peça del dia» (màxim 1 avís diari) o
   «Desactivades». L'antic «resum cultural del cap de setmana» NO va aquí:
   si es vol, és una edició setmanal del butlletí que ja existeix (tasca petita
   i separada, fora d'aquesta fase).
2. **El jutge de «la peça del dia», definit abans d'escriure codi**: el filtre
   editorial d'IA que ja puntua les peces n'escull la de més impacte del refresc
   del matí; a igualtat, mana la diversitat (no repetir la categoria del dia
   abans). La regla s'escriu al codi i a la documentació, no queda a
   discreció de ningú.
3. **El servidor guarda només**: subscripció de l'aparell + opció triada. La
   pàgina de Privacitat s'actualitza amb aquesta frase exacta.
4. **Primer el web, després l'iPhone.** El canal web (PWA) es fa i es verifica
   sencer; el canal d'Apple (APNs, que ja té infraestructura al codi) s'activa
   en un segon pas, mai alhora.
5. **Topall anti-spam al servidor**, no al client: encara que hi hagi un error,
   el sistema es nega a enviar més d'un avís per dia i aparell.

### Fet vol dir

- Un aparell subscrit rep com a màxim 1 avís al dia, i és la peça triada pel jutge.
- Donar-se de baixa funciona i esborra la subscripció del servidor.
- Provat amb un aparell real (no només amb proves automàtiques).

---

## Fase 5 (esbós, fora d'aquesta fase) — Proximitat territorial

L'antic Pilar 3 (triar municipi/comarca per a Agenda, RAISC i Idescat) és una
fase pròpia perquè toca l'arquitectura: avui tothom rep la mateixa portada
cuinada dos cops al dia, i el radar ja va just del límit de subpeticions (el
codi rota les fonts precisament per això). Fer-ho bé demana:

- Un estudi previ del pressupost de subpeticions.
- Servei per comarca sota demanda amb memòria cau pròpia i caducitat (no
  precuinar 42 comarques al cron).
- Decidir el primer cercle de comarques (proposta: les del Barcelonès i el
  Maresme, on ja hi ha lectors) abans d'obrir-ho tot.

No s'aprova ni es planifica dins la Fase 4.

---

## Ordre, mida i condicions

| Ordre | Bloc | Mida | Condició per començar el següent |
|---|---|---|---|
| 1r | Accessibilitat i ús educatiu | Petita | Vist a producció amb captures |
| 2n | «Els meus interessos» (destacar) | Petita-mitjana | Portada intacta per a qui no en té |
| 3r | Notificacions assenyades (només web) | Mitjana | Provat amb aparell real |
| després | Canal Apple de notificacions | Petita | Bloc 3 verificat |

Cada bloc: proves automàtiques noves + suite completa verda (161 proves o més)
+ desplegament + comprovació visual a bondiari.com. Un bloc no comença fins que
l'anterior està *vist*, no només desplegat.
