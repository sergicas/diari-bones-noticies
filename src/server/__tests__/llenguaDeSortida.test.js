import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// LA LLENGUA DE SORTIDA MANA.
//
// El prompt del redactor deia "EXACTAMENT en la llengua indicada (no el
// tradueixis)". Amb fonts catalanes volia dir "no canviïs d'idioma" i anava bé.
// Amb el gir editorial, TOTES les fonts són en anglès i la sortida ha de ser en
// català: el model llegia "no el tradueixis" i deixava titular, cos i impacte
// en anglès. Les 25 primeres peces de la sala de revisió van sortir així.
//
// Aquesta prova no pot cridar el model, però sí que pot vigilar que la
// instrucció no torni a dir el contrari del que volem.

const font = readFileSync(new URL('../storyText.js', import.meta.url), 'utf8')
// Només el que de debò se li envia al model: els comentaris del codi expliquen
// l'error antic i el citen, i no han de comptar com si fos la instrucció.
const prompt = font
  .slice(0, font.indexOf('const LANG_NAMES'))
  .split('\n')
  .filter((linia) => !linia.trim().startsWith('//'))
  .join('\n')

describe('el redactor sap en quina llengua ha d’escriure', () => {
  it('no diu enlloc que no tradueixi, sense matisar-ho', () => {
    // La forma perillosa és l'ordre nua: davant d'un original en anglès, el
    // model l'obeeix i es queda en anglès.
    expect(prompt).not.toMatch(/\(no el tradueixis\)/)
  })

  it('mana escriure en la llengua indicada, passi el que passi amb el context', () => {
    const insistencies = prompt.match(/SEMPRE en la llengua indicada/g) || []
    // Titular, cos i impacte: els tres camps de text que llegeix una persona.
    expect(insistencies.length).toBeGreaterThanOrEqual(3)
  })

  it('avisa expressament que el material de context pot ser d’una altra llengua', () => {
    expect(prompt).toMatch(/encara que el (material de )?context (estigui|estigui)/)
  })

  it('la il·lustració segueix demanant-se en anglès', () => {
    // L'escena per al generador d'imatges sí que ha d'anar en anglès: és una
    // instrucció per a una màquina, no un text per al lector.
    expect(prompt).toMatch(/escena visual concreta EN ANGLÈS/)
  })
})
