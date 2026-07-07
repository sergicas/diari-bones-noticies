# Widget de pantalla d'inici — El Bon Diari

Aquest directori conté el codi Swift del widget (`BonDiariWidget.swift`). El
widget mostra la bona notícia més recent i es refresca sol baixant l'API pública
`https://bondiari.com/api/live-news` (no cal App Group ni dades compartides).

El codi ja està escrit i verificat. L'únic pas que **s'ha de fer a Xcode una sola
vegada** és crear el *target* de l'extensió (Xcode és qui hi connecta la
signatura, la fase d'*embed* i el `Info.plist` de l'extensió; per això no es pot
fer editant fitxers a mà).

## Passos a Xcode (un sol cop, ~2 min)

1. Obre el projecte: `npm run ios:open` (o obre `ios/App/App.xcworkspace`).
2. Menú **File → New → Target…**
3. Tria **Widget Extension** i prem **Next**.
4. Product Name: **NewsWidget**.
   - **Desmarca** "Include Live Activity".
   - **Desmarca** "Include Configuration App Intent" (volem un widget estàtic).
   - Team: el mateix que l'app (com.bondiari.app).
5. Prem **Finish**. Si demana "Activate scheme?", prem **Activate**.
6. Xcode crea la carpeta del target amb uns fitxers d'exemple
   (`NewsWidget.swift`, `NewsWidgetBundle.swift`, potser `AppIntent.swift`).
   **Esborra'ls** (Move to Trash) — el nostre `BonDiariWidget.swift` ja porta el
   seu propi `@main`.
7. Arrossega `ios/App/NewsWidget/BonDiariWidget.swift` cap al target **NewsWidget**
   dins de Xcode. A "Add to targets" marca **només NewsWidget** (no l'app App).
8. Selecciona el target **NewsWidget → General → Minimum Deployments** i posa
   **iOS 16.0** o superior.
9. **Product → Build** (⌘B). Ha de compilar sense errors.

## Provar-ho

- Executa l'app al telèfon (▶). Surt de l'app, mantén premuda la pantalla
  d'inici, prem **+** (a dalt a l'esquerra), busca **El Bon Diari** i afegeix el
  widget (mida petita o mitjana).
- En pocs segons ha de mostrar el titular i la imatge de la portada.
- En tocar-lo, s'obre l'app (via l'esquema `bondiari://`, ja registrat a
  `ios/App/App/Info.plist`).

## Notes

- El widget fa servir només HTTPS, així que no cal cap excepció d'ATS. Si una
  imatge concreta falla, ensenya el fons vermell de marca (no peta mai).
- Per a l'*archive* final: **Product → Archive** amb l'esquema **App** (no el del
  widget). L'extensió s'inclou automàticament dins l'app.
- No cal tornar a tocar signatura ni capabilities de push: ja hi són.
