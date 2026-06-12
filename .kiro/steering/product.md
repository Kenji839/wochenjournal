# Produkt – Wochenjournal-Generator

## Was es ist

Eine persönliche Web-App, die einem Lernenden hilft, sein wöchentliches
Arbeitsjournal mit Hilfe der Google Gemini API zu erstellen – inkrementell über
die Woche verteilt statt alles am Schluss.

## Zielnutzer

- Ein Lernender: Applikationsentwickler EFZ, 3. Lehrjahr, Appbakery / SBB Bern.
- Einzelnutzer, keine Mehrbenutzer-Szenarien, kein geteilter Zugriff.

## Kernnutzen

- Aus kurzen Stichworten entstehen professionell formulierte Texte.
- Der Aufwand verteilt sich über die Woche (täglich wenige Minuten).
- Konsistentes, abgabefertiges Format ohne manuelle Nacharbeit.

## Workflow

1. **Woche wählen** (KW + Jahr; Standard = aktuelle Woche).
2. **Täglich (Mo–Fr)**: ein paar Stichworte erfassen → ein Tagesabsatz wird
   generiert und kann bearbeitet werden.
3. **Freitag**: aus den Tagesabsätzen wird die Reflexion (4 Abschnitte)
   generiert; der Kontext der letzten bis zu 3 Wochen fliesst ein, um
   Fortschritte abzuleiten.
4. **Export**: das zusammengesetzte Journal kopieren oder als `.txt` herunterladen.

## Ziel-Journalformat

```
**Arbeitsjournal – KW {KW} / {JAHR}**
Lernender: Timo
Betrieb: Appbakery / SBB, Bern
Ausbildungsjahr: 3. Lehrjahr

**Was habe ich diese Woche gemacht?**
Montag: …   (Dienstag … Freitag)

**Was ist mir in dieser Woche gut gelungen?**
- …
**Probleme / Herausforderungen**
- …
**Was kann ich besser machen in Zukunft?**
- …
**Was habe ich diese Woche neu gelernt?**
- …
```

## Produktprinzipien

- **Schweizer Hochdeutsch** in allen generierten Inhalten (kein "ß", immer "ss").
- **Keine erfundenen Details** – nur verwenden, was der Nutzer eingegeben hat.
- **Format ist fix** – exakt einhalten, damit das Journal direkt abgegeben werden
  kann.
- **Inkrementell** – Tagesabsätze einzeln, Reflexion am Schluss.
- **Lokal und privat** – kein Login, keine Datenbank; Daten bleiben im Browser
  (`localStorage`), Verlauf der letzten 10 Wochen.

## Bewusst nicht im Scope

- Authentifizierung / Mehrbenutzer / geteilter Zugriff.
- Server-seitige Datenbank oder Cloud-Sync.
- PDF/DOCX-Export (nur `.txt`).
- Mehrsprachige UI (UI ist auf Deutsch).
