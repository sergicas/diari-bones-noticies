# Prova editorial en sec — 13 d’agost de 2026

Aquest document és un dossier de validació, no una cua de publicació. No s’ha escrit res a KV o D1, no s’ha afegit cap peça a `src/data/articles.js`, ni s’han regenerat `public/feed.xml` o `public/sitemap.xml`. Tampoc no s’ha activat cap notificació ni desplegament.

## Traçabilitat de la prova

- S’han consultat amb les capçaleres de navegador del projecte els 14 feeds configurats: NASA, ESO, ESA/Hubble, ESA/Webb, PLOS Biology, PLOS ONE, Phys.org, Quanta Magazine, MIT Technology Review, Aeon, Psyche, Literary Hub, Public Domain Review i STAT.
- Tots han retornat RSS/Atom vàlid i almenys un ítem recent en aquesta passada. NIH Research Matters continua exclòs.
- Cada proposta de sota ha estat contrastada amb la font original. Les propostes de Circuit B estan redactades de nou en català; no reutilitzen ni tradueixen text, ni imatges, de la pista.
- `category` es manté com a família canònica d’ingesta; `topic` és el tema públic. La decisió anotada és la que retorna `assignEditorialTopic` per al registre de prova.
- Les il·lustracions pròpies es materialitzarien, només després d’aprovació, via `/api/story-image/:id`. En aquest dossier no se n’ha generat cap fitxer ni URL definitiva.

## 1. Astronomia — Circuit A

**Decisió de tema.** `category: Ciència`. **Astronomia**, pas 2 de la regla: `sourceTopic: Astronomia` de la font de Circuit A ESA/Webb té prioritat sobre el text.

**Font i drets.** ESA/Webb; adaptació permesa amb crèdit, [llicència CC BY 4.0 i prova de llicència](https://esawebb.org/copyright/). Peça original: [Webb reveals dust and water surviving in the extreme environment around the Milky Way’s central black hole](https://esawebb.org/news/weic2617/), 11-08-2026. Crèdit editorial obligatori: ESA/Webb.

**Titular.** Webb detecta aigua i pols molt a prop del forat negre central de la Via Làctia

**Cos.** Les observacions del telescopi James Webb han mostrat que, en l’entorn extrem del forat negre supermassiu Sagittarius A*, encara s’hi poden formar i conservar materials essencials. L’equip ha estudiat l’estrella envellida IRS 3, situada a uns 0,55 anys llum del centre galàctic, amb l’instrument d’infraroig mitjà MIRI. L’espectre hi identifica pols rica en oxigen i, per primera vegada en aquesta envolta estel·lar, aigua. IRS 3 perd gas amb el vent estel·lar i aporta matèria que pot acabar alimentant futures generacions d’estrelles i planetes. El resultat no descriu un procés de vida, sinó una observació que ajuda a entendre com es recicla la matèria fins i tot al centre d’una galàxia.

**Imatge.** Fotografia institucional triada: [`weic2617a.jpg`](https://cdn.esawebb.org/archives/images/screen/weic2617a.jpg). Autor/crèdit: ESA/Webb, NASA & CSA, F. Peißker, J. Lu, F. Yusef-Zadeh, N. B. Sabha i C. Chan; font: [fitxa de la notícia](https://esawebb.org/news/weic2617/); llicència: CC BY 4.0; prova: [copyright ESA/Webb](https://esawebb.org/copyright/). Passa `imageRules`: fotografia externa, `verified: true`, llicència lliure, URL de prova i cap incompatibilitat de tercers declarada.

## 2. Ciència — Circuit B

**Decisió de tema.** `category: Ciència`. **Ciència**, pas 3: no hi ha decisió manual ni `sourceTopic`; la primera coincidència aplicable de l’ordre de desempat és la regla de Ciència, també reforçada per la categoria canònica.

**Font i drets.** Quanta Magazine; Circuit B, per tant pista per a redacció pròpia i enllaç, sense reutilització. Original: [Neutrinos From Deep Inside Earth Provide a New Picture of the Mantle](https://www.quantamagazine.org/neutrinos-from-deep-inside-earth-provide-a-new-picture-of-the-mantle-20260807/), 07-08-2026.

**Titular.** Els geoneutrins obren una finestra nova sobre la calor que mou la Terra

**Cos.** Uns detectors enterrats a gran profunditat intenten captar geoneutrins: partícules molt esquives que s’originen en processos radioactius de l’interior terrestre. La seva lectura pot ajudar a estimar com es distribueixen els elements que contribueixen a la calor del mantell, una peça clau del motor tectònic del planeta. El detector SNO+, al Canadà, fa servir una esfera amb líquid centellejador i una capa d’aigua i roca per reduir el soroll de la radiació exterior. A la Xina, l’experiment JUNO preveu afegir mesures a aquesta xarxa internacional. És una recerca encara gradual: no ofereix una imatge directa del mantell, però suma dades d’un lloc on no podem arribar amb perforacions.

**Imatge.** **Il·lustració pròpia**: secció subterrània serena de la Terra, un detector esfèric i traços de partícules sense text. Motiu: Circuit B; la imatge de Quanta no es reutilitza i no s’ha aportat una fitxa `imageRights` verificable per a una foto externa. Passa `imageRules` com a imatge editorial generada.

## 3. Biotecnologia — Circuit A

**Decisió de tema.** `category: Ciència`. **Biotecnologia**, pas 3: el contingut sobre la larva de *Drosophila*, la senyalització hormonal i els pèptids activa la regla de Biotecnologia, que precedeix Ciència.

**Font i drets.** PLOS Biology; adaptació permesa amb [CC BY 4.0](https://journals.plos.org/plosbiology/s/journal-information). Original revisat per parells: [A nutrient-sensitive enterokine coordinates developmental plasticity through inter-organ signaling](https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.3003911), 11-08-2026, DOI [10.1371/journal.pbio.3003911](https://doi.org/10.1371/journal.pbio.3003911). Crèdit: Longwei Bai, Jacques Montagne, Cathy Isaura Ramos i François Leulier / PLOS Biology.

**Titular.** Un senyal de l’intestí ajuda les larves a ajustar el creixement quan escassegen nutrients

**Cos.** Un estudi amb larves de *Drosophila* descriu un circuit que connecta intestí, teixit adipós i cervell quan disminueixen els aminoàcids disponibles. Les autores i autors identifiquen la limostatina com una hormona intestinal que redueix el senyal d’un pèptid similar a la insulina i, així, frena el ritme de desenvolupament. Aquesta pausa regulada ajuda les larves a mantenir la viabilitat en condicions de restricció nutricional. El treball delimita un mecanisme de biologia del desenvolupament en mosques; no és un tractament ni permet inferir efectes en persones. La seva utilitat és fer més visible com els òrgans coordinen respostes davant canvis en l’alimentació.

**Imatge.** **Il·lustració pròpia**: intestí de larva, senyals suaus cap a un cervell esquemàtic i molècules abstractes, sense text. Motiu: tot i la llicència oberta de l’article, el feed no aporta una fitxa individual de figura amb autor i URL de prova; per prudència no es reutilitza cap figura fins verificar-la. Passa `imageRules` com a imatge editorial generada.

## 4. IA — Circuit B

**Decisió de tema.** `category: Tecnologia`. **IA**, pas 3: “AI agents” és una coincidència de la regla IA, que va abans de Tecnologia a l’ordre de desempat.

**Font i drets.** MIT Technology Review; Circuit B, redacció original obligatòria. Pista: [Scaling AI agents with trustworthy data](https://www.technologyreview.com/2026/08/12/1141032/scaling-ai-agents-with-trustworthy-data/), 12-08-2026. És contingut elaborat amb Google Cloud; no es tracta com a evidència independent ni se’n reutilitza cap expressió.

**Titular.** Els agents d’IA necessiten dades traçables abans d’assumir tasques autònomes

**Cos.** L’ús d’agents d’intel·ligència artificial canvia el problema de respondre preguntes pel de prendre accions sobre sistemes reals. Per això, la qualitat de les dades, el seu context i els permisos d’accés han de formar part del disseny, no ser un ajust posterior. La peça de MIT Technology Review descriu una enquesta en què moltes organitzacions declaren que els sistemes heretats limiten tant l’accés a les dades com la confiança en les decisions dels agents. La lliçó editorial no és una promesa d’eficiència: abans d’automatitzar una acció, cal poder rastrejar quines dades l’han sustentada i qui en respon. Aquesta és una condició especialment rellevant per a serveis que afecten persones.

**Imatge.** **Il·lustració pròpia**: una taula de dades ordenada que alimenta un petit agent abstracte amb permisos visibles com a claus, sense text ni marques. Motiu: Circuit B i contingut patrocinat; no es reutilitza cap imatge de la font. Passa `imageRules` com a imatge editorial generada.

## 5. Tecnologia — Circuit B

**Decisió de tema.** `category: Tecnologia`. **Tecnologia**, pas 3: el titular no activa cap tema anterior de l’ordre de desempat; la regla Tecnologia coincideix amb la categoria canònica. Ítem del feed: [The Download: our 35 young innovators and the “censorship-industrial complex”](https://www.technologyreview.com/2026/08/12/1141714/the-download-innovators-under-35-censorship-industrial-complex/), 12-08-2026. La proposta només tracta el subítem sobre Innovators Under 35, no la resta del butlletí.

**Font i drets.** MIT Technology Review; Circuit B, pista i redacció pròpia. No es reprodueix el butlletí ni s’hi incorporen els altres temes, que no són objecte d’aquesta peça.

**Titular.** Una selecció de joves innovadors posa el focus en problemes tècnics concrets

**Cos.** MIT Technology Review anuncia que revelarà el 8 de setembre la seva llista Innovators Under 35 de 2026. La selecció reconeix 35 persones joves que treballen en recerca i en solucions tècniques per a problemes concrets, després d’un procés de 550 nominacions. La dada no és una prova que cap projecte funcioni per si sol, però ofereix una porta d’entrada per seguir talent emergent amb criteri i no només per novetat. La proposta del diari pot explicar què avalua una selecció d’aquest tipus —problema, mètode, limitacions i possibilitat de replicació— abans de presentar-ne cap cas individual. Així es manté la distància necessària entre reconeixement, publicitat i impacte verificat.

**Imatge.** **Il·lustració pròpia**: un banc de treball amb prototips neutres, eines i una persona no identificable observant-los, sense logotips. Motiu: Circuit B; les fotografies de la selecció no tenen `imageRights` verificats en aquest dossier. Passa `imageRules` com a imatge editorial generada.

## 6. Longevitat — Circuit B, condicionada

**Decisió de tema.** `category: Salut`. **Longevitat**, pas 1: marca editorial explícita `topic: Longevitat`, validada abans de qualsevol regla de text. Això és necessari perquè el títol no conté el vocabulari complet de la taxonomia. No s’ha aplicat cap producte, clínica ni promesa terapèutica.

**Font i drets.** STAT; Circuit B, redacció pròpia obligatòria. Pista: [Are blue zones real? Answering that question is harder than ever](https://www.statnews.com/2026/05/04/are-blue-zones-real-new-scrutiny-longevity-hot-spots/), 04-05-2026. **Condició important:** la font STAT és activa, però els seus 20 ítems actuals no contenen una pista de longevitat. Aquesta peça procedeix de l’arxiu públic recent de la mateixa font, no de l’instantani actual de l’RSS; per tant queda exclosa d’integració automàtica fins que l’editora n’accepti expressament aquesta excepció o arribi una pista RSS equivalent.

**Estudi revisat per parells.** *Experimental Gerontology*: [Identification of a geographic area characterized by extreme longevity in the Sardinia island: the AKEA study](https://pubmed.ncbi.nlm.nih.gov/15489066/), Poulain et al., 2004, DOI [10.1016/j.exger.2004.06.016](https://doi.org/10.1016/j.exger.2004.06.016). L’estudi identifica una concentració geogràfica de longevitat extrema a Sardenya; no prova una recepta individual per allargar la vida.

**Titular.** Les zones blaves demanen més dades que eslògans per parlar de longevitat

**Cos.** El debat sobre les anomenades zones blaves recorda que la longevitat no es pot convertir honestament en un paquet de consum. L’estudi AKEA de 2004 va localitzar a la Sardenya central-oriental una concentració de persones centenàries i va descriure-la amb indicadors demogràfics. Aquella observació va obrir preguntes sobre entorn, història i salut, però no estableix que una dieta, un suplement o una rutina produeixin el mateix resultat en qualsevol persona. La peça de STAT recull que les dades i les afirmacions comercials associades al concepte són objecte de debat. Per al diari, l’angle útil és separar una observació poblacional d’una prescripció mèdica i recordar que calen estudis i context abans d’atribuir causalitats.

**Imatge.** **Il·lustració pròpia**: un mapa topogràfic abstracte de Sardenya amb cercles demogràfics i persones grans no identificables caminant, sense text. Motiu: Circuit B; la foto de STAT és d’agència i no té `imageRights` verificats. Passa `imageRules` com a imatge editorial generada.

## 7. Filosofia — Circuit B

**Decisió de tema.** `category: Cultura`. **Filosofia**, pas 1: decisió editorial explícita `topic: Filosofia`. La font no aporta una paraula que activi el patró (`Hegelian` no inclou “philosoph”), tot i que l’objecte és inequívoc; aquesta prova documenta l’ús correcte de la prioritat manual, no una ampliació silenciosa del patró.

**Font i drets.** Psyche; Circuit B, redacció original obligatòria. Pista: [How to think like a Hegelian](https://psyche.co/guides/how-to-think-like-a-hegelian), 10-08-2026.

**Titular.** Pensar els desacords com a processos pot fer més precisa la conversa pública

**Cos.** Una guia de Psyche sobre Hegel ofereix una ocasió per acostar una idea filosòfica sense convertir-la en una fórmula. El punt de partida és que una tensió entre dues posicions no s’ha de llegir sempre com un combat amb un únic guanyador: també pot revelar límits de cada mirada i forçar una comprensió més àmplia. Aquesta manera de pensar no elimina els desacords ni decideix qüestions polítiques o personals. Sí que pot ajudar a formular millor què afirma cadascú, quines experiències deixa fora i què canviaria una conclusió. La peça hauria de presentar Hegel com una eina per examinar arguments, no com un manual de solucions ràpides.

**Imatge.** **Il·lustració pròpia**: dues formes geomètriques contrastades que convergeixen en una tercera forma oberta, sense text ni retrats. Motiu: Circuit B; Psyche no autoritza la republicació d’imatges en aquesta prova i no hi ha drets verificats. Passa `imageRules` com a imatge editorial generada.

## 8. Literatura — Circuit B

**Decisió de tema.** `category: Cultura`. **Literatura**, pas 3: “writers” i “lit mags” activen la regla Literatura, que precedeix Filosofia, Ciència i Tecnologia.

**Font i drets.** Literary Hub; Circuit B, redacció original obligatòria. Pista: [What Happens When You Mail 30 Writers Free Lit Mags?](https://lithub.com/what-happens-when-you-mail-30-writers-free-lit-mags/), 12-08-2026.

**Titular.** Un petit enviament de revistes literàries prova maneres d’obrir lectors i submissions

**Cos.** El projecte Chill Subs i *The Georgia Review* van enviar tres números endarrerits de la revista a trenta escriptores i escriptors, acompanyats de cartes dels editors sobre lectura i enviament de manuscrits. L’experiment va mobilitzar una llista d’espera de 1.527 persones i va fer créixer la seva newsletter, però no va generar subscripcions entre les participants durant la prova. El resultat és interessant justament perquè no és triomfalista: fer circular objectes culturals i explicar criteris editorials pot ampliar l’interès, però no substitueix una comunitat sostinguda ni un model econòmic. Per al lector, és una finestra a la feina invisible de les revistes: trobar textos adequats, explicar què publiquen i construir una relació amb qui escriu.

**Imatge.** **Il·lustració pròpia**: sobres oberts, revistes literàries sense títol llegible i una carta manuscrita abstracta damunt una taula, sense text reproduïble. Motiu: Circuit B; no es reutilitza cap fotografia ni portada de Literary Hub o de la revista. Passa `imageRules` com a imatge editorial generada.

## Resultat editorial

Set propostes provenen d’ítems de l’instantani RSS actiu. La de Longevitat és una **proposta condicionada** de l’arxiu de STAT: compleix Circuit B i cita l’estudi revisat, però no compleix el requisit més estricte d’haver aparegut en l’RSS actual. No és apta per publicar ni integrar automàticament sense la validació explícita de l’editora. Les altres set també continuen sent només candidatures: aquesta prova no crea cap entrada editorial.
