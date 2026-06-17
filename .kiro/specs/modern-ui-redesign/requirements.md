# Requirements Document

## Introduction

Diese Spezifikation beschreibt eine moderne Neugestaltung der Oberfläche des
Wochenjournal-Generators. Die App sieht heute funktional, aber gedrungen aus:
Der Inhalt ist auf eine zentrierte, schmale Spalte (`max-w-6xl`) begrenzt und
lässt auf grossen Bildschirmen breite, leere Ränder. Ziel ist ein praktisches,
modernes Erscheinungsbild, das die volle Bildschirmbreite nutzt.

Die Neugestaltung ist rein gestalterisch und strukturell auf Layout-Ebene. Die
gesamte bestehende Funktionalität bleibt unverändert erhalten: Wochenauswahl,
Tageskarten (Mo–Fr), Reflexion, Gesamtjournal-Vorschau mit Kopieren, Download,
Confluence-Upload und KI-Überarbeitung sowie der Verlauf der letzten Wochen.
Eine Bindung an die SBB-Marke ist nicht erforderlich.

Beschränkungen aus dem Steering gelten weiterhin: Next.js 16, React 19,
Tailwind v4 (`@theme`-Tokens in `app/globals.css`), TypeScript strict, deutsche
UI. Es werden keine neuen Abhängigkeiten eingeführt. Komponenten liegen in
`components/`, das Styling erfolgt über Tailwind v4. Änderungen erfolgen
chirurgisch und betreffen Darstellung und Layout, nicht die Logik.

## Glossary

- **Oberfläche**: Die gesamte sichtbare Benutzeroberfläche des
  Wochenjournal-Generators, gerendert über `app/page.tsx` und die Komponenten
  in `components/`.
- **Layout**: Die räumliche Anordnung der Oberflächenbereiche (Kopfzeile,
  Wochenauswahl, Tageskarten, Reflexion, Gesamtjournal, Verlauf).
- **Inhaltsbereich**: Der horizontale Bereich, in dem die Oberfläche ihre
  Inhalte darstellt.
- **Viewport**: Der sichtbare Anzeigebereich des Browserfensters.
- **Designtokens**: Die in `app/globals.css` im `@theme`-Block definierten
  CSS-Variablen (Farben, Schrift) und davon abgeleitete Tailwind-Utilities.
- **Tageskarte**: Die UI-Komponente für einen Wochentag (Mo–Fr) mit
  Stichworten, Generieren-Aktion und bearbeitbarem Tagesabsatz.
- **Reflexionsbereich**: Die UI-Komponente zur Erstellung und Bearbeitung der
  Wochenreflexion.
- **Gesamtjournal-Bereich**: Die UI-Komponente zur Vorschau, Bearbeitung,
  Kopie, zum Download, zum Confluence-Upload und zur KI-Überarbeitung des
  zusammengesetzten Journals.
- **Verlaufsbereich**: Die UI-Komponente, die die gespeicherten Wochen auflistet
  und Auswahl sowie Löschen erlaubt.
- **Breakpoint**: Eine durch Bildschirmbreite definierte Grenze, ab der das
  Layout seine Anordnung ändert (Tailwind-Breakpoints `sm`, `lg`, `xl`).

## Requirements

### Requirement 1: Volle Bildschirmbreite nutzen

**User Story:** Als Nutzer möchte ich, dass die App die gesamte Bildschirmbreite
nutzt, damit auf grossen Monitoren keine breiten leeren Ränder entstehen und ich
mehr Inhalt gleichzeitig sehe.

#### Acceptance Criteria

1. THE Oberfläche SHALL den Inhaltsbereich über die volle Breite des Viewport
   abzüglich eines seitlichen Innenabstands von genau 48px je Seite darstellen,
   sodass der Inhaltsbereich eine Breite von Viewport-Breite minus 96px einnimmt.
2. THE Oberfläche SHALL keine feste maximale Inhaltsbreite (CSS
   max-width-Begrenzung) auf den äusseren Inhaltscontainer anwenden, sodass der
   Inhaltsbereich bei jeder Viewport-Breite ab 320px die volle verfügbare Breite
   (Viewport-Breite minus seitlicher Innenabstand) einnimmt und nicht zentriert
   begrenzt wird.
3. WHILE die Viewport-Breite mindestens 1280px beträgt, THE Layout SHALL den
   Inhaltsbereich auf eine Breite von Viewport-Breite minus 96px aufspannen,
   wobei links und rechts je höchstens 48px ungenutzter Rand verbleibt.
4. WHILE die Viewport-Breite kleiner als 640px ist, THE Oberfläche SHALL den
   seitlichen Innenabstand auf genau 16px je Seite reduzieren, sodass der
   Inhaltsbereich eine Breite von Viewport-Breite minus 32px einnimmt.
5. THE Oberfläche SHALL den Inhaltsbereich ohne horizontale Scrollleiste
   darstellen, sodass die Gesamtbreite aller Elemente die Viewport-Breite nicht
   überschreitet.

### Requirement 2: Bestehende Funktionalität erhalten

**User Story:** Als Nutzer möchte ich, dass nach der Neugestaltung alle heutigen
Funktionen unverändert verfügbar sind, damit mein Arbeitsablauf nicht
beeinträchtigt wird.

#### Acceptance Criteria

1. THE Oberfläche SHALL die Wochenauswahl mit Kalenderwoche (Ganzzahl von 1 bis
   53) und Jahr bereitstellen.
2. WHEN die Oberfläche erstmals geladen wird, THE Oberfläche SHALL die aktuelle
   Kalenderwoche und das aktuelle Jahr als vorausgewählte Werte anzeigen.
3. THE Oberfläche SHALL genau fünf Tageskarten für die Wochentage Montag,
   Dienstag, Mittwoch, Donnerstag und Freitag anzeigen, wobei jede Tageskarte
   eine Stichworteingabe, eine Generieren-Aktion und einen bearbeitbaren
   Tagesabsatz enthält.
4. THE Oberfläche SHALL den Reflexionsbereich mit Generieren-Aktion und
   bearbeitbarem Reflexionstext bereitstellen.
5. THE Oberfläche SHALL den Gesamtjournal-Bereich mit genau den vier Aktionen
   Kopieren, Download als `.txt`, Confluence-Upload und KI-Überarbeitung
   bereitstellen.
6. WHERE das Gesamtjournal manuell bearbeitet wurde, THE Oberfläche SHALL eine
   Aktion zum Verwerfen bereitstellen, die den Gesamtjournal-Text auf den aus den
   Tagesabsätzen und der Reflexion zusammengesetzten Text zurücksetzt.
7. THE Oberfläche SHALL den Verlaufsbereich mit Auswahl und Löschen gespeicherter
   Wochen bereitstellen und dabei höchstens zehn gespeicherte Wochen vorhalten.
8. WHILE eine Generierung läuft, THE Oberfläche SHALL jedes empfangene
   Textsegment unmittelbar nach Empfang an den jeweiligen Zielbereich
   (Tagesabsatz oder Reflexionstext) anhängen.
9. IF eine der Aktionen Generieren, Confluence-Upload oder KI-Überarbeitung
   fehlschlägt, THEN THE Oberfläche SHALL eine deutschsprachige Fehlermeldung
   anzeigen, die so lange sichtbar bleibt, bis der Nutzer sie schliesst, und den
   Inhalt des jeweiligen Zielbereichs unverändert lassen.

### Requirement 3: Modernes Erscheinungsbild

**User Story:** Als Nutzer möchte ich ein modernes, aufgeräumtes Erscheinungsbild,
damit die App zeitgemäss und angenehm zu benutzen wirkt.

#### Acceptance Criteria

1. THE Oberfläche SHALL für Farben, Abstände und Eckenradien ausschliesslich die
   in `app/globals.css` definierten Designtokens verwenden.
2. IF ein Stilwert für Farbe, Abstand oder Eckenradius ausserhalb der in
   `app/globals.css` definierten Designtokens gesetzt wird (z. B. ein fest
   codierter Hex-, Pixel- oder rem-Wert), THEN THE Oberfläche SHALL diesen als
   Verstoss behandeln und keinen solchen fest codierten Wert enthalten.
3. THE Oberfläche SHALL die Schriftgrössen so darstellen, dass die Schriftgrösse
   der Kopfzeile grösser als die der Bereichstitel und die Schriftgrösse der
   Bereichstitel grösser als die des Fliesstexts ist
   (Kopfzeile > Bereichstitel > Fliesstext).
4. THE Oberfläche SHALL für gleichartige Übergänge denselben tokenbasierten
   Abstand verwenden, sodass alle Abstände desselben Übergangstyps (z. B.
   zwischen Bereichstitel und zugehörigem Inhalt) auf denselben Abstandstoken aus
   `app/globals.css` zurückgehen.
5. THE Oberfläche SHALL Bedienelemente desselben Typs (z. B. alle primären
   Schaltflächen, alle Eingabefelder) über alle Bereiche hinweg mit identischen
   tokenbasierten Werten für Farbe, Abstand und Eckenradius darstellen.
6. THE Oberfläche SHALL keine SBB-Markengestaltung verwenden; insbesondere SHALL
   die SBB-Markenfarbe weder als Primär- noch als Akzentfarbe eingesetzt werden.

### Requirement 4: Responsives Verhalten

**User Story:** Als Nutzer möchte ich, dass die App auf unterschiedlichen
Bildschirmgrössen brauchbar bleibt, damit ich sie auch auf kleineren Fenstern
verwenden kann.

#### Acceptance Criteria

1. WHILE die Viewport-Breite weniger als 640px beträgt, THE Layout SHALL alle
   Bereiche (Wochenauswahl, Verlauf, Tageskarten, Reflexion, Journal-Vorschau)
   einspaltig untereinander anordnen.
2. WHILE die Viewport-Breite mindestens 640px und weniger als 1024px beträgt,
   THE Layout SHALL alle Bereiche einspaltig untereinander anordnen.
3. WHILE die Viewport-Breite mindestens 1024px beträgt, THE Layout SHALL
   Wochenauswahl und Verlauf in einer von den Inhaltsbereichen (Tageskarten,
   Reflexion, Journal-Vorschau) getrennten Spalte darstellen.
4. THE Layout SHALL bei jeder Viewport-Breite ab 320px den gesamten
   Seiteninhalt vollständig innerhalb der Viewport-Breite und ohne horizontales
   Scrollen des Seiteninhalts darstellen.
5. WHILE die Viewport-Breite mindestens 1024px beträgt, THE Layout SHALL die
   Tageskarten (Mo–Fr) nebeneinander in einem Raster mit höchstens 5 Spalten pro
   Zeile anordnen.
6. WHILE die Viewport-Breite weniger als 1024px beträgt, THE Layout SHALL die
   Tageskarten einspaltig untereinander anordnen.

### Requirement 5: Lesbarkeit und Bedienbarkeit der Inhaltsbereiche

**User Story:** Als Nutzer möchte ich, dass Textbereiche bei voller Breite gut
lesbar und bedienbar bleiben, damit das breitere Layout keinen Komfort kostet.

#### Acceptance Criteria

1. THE Gesamtjournal-Bereich SHALL den Journaltext in einem Eingabefeld mit einer
   maximalen Zeilenlänge von 75 Zeichen pro Zeile darstellen und Text, der diese
   Länge überschreitet, automatisch umbrechen.
2. THE Oberfläche SHALL die bearbeitbaren Textfelder für Stichworte,
   Tagesabsätze, Reflexion und Gesamtjournal vertikal in der Höhe anpassbar
   darstellen, mit einer Mindesthöhe von 3 sichtbaren Textzeilen.
3. WHILE eine Generierung läuft, THE Oberfläche SHALL die Eingabe- und
   Bedienelemente des betroffenen Bereichs (Stichwort-Eingabe,
   Generieren-Schaltfläche und das zugehörige bearbeitbare Textfeld) gegen
   Eingaben sperren.
4. WHILE eine Generierung läuft, THE Oberfläche SHALL im betroffenen Bereich
   einen sichtbaren Streaming-Hinweis anzeigen.
5. WHEN eine Generierung abgeschlossen ist oder fehlschlägt, THE Oberfläche SHALL
   die zuvor gesperrten Bedienelemente wieder freigeben und den Streaming-Hinweis
   entfernen.

### Requirement 6: Zugänglichkeit und deutsche UI

**User Story:** Als Nutzer möchte ich eine zugängliche, deutschsprachige
Oberfläche, damit die App klar verständlich und gut bedienbar bleibt.

#### Acceptance Criteria

1. THE Oberfläche SHALL alle Beschriftungen, Schaltflächentexte sowie Status- und
   Fehlermeldungen in deutscher Sprache (Schweizer Hochdeutsch, ohne "ß",
   stattdessen "ss") darstellen.
2. WHEN ein interaktives Element ohne sichtbaren Text dargestellt wird, THE
   Oberfläche SHALL für dieses Element ein zugängliches Label (`aria-label`) mit
   beschreibendem deutschem Text bereitstellen.
3. WHEN ein interaktives Element den Tastaturfokus erhält, THE Oberfläche SHALL
   einen sichtbaren Fokusindikator mit einem Kontrastverhältnis von mindestens
   3:1 gegenüber den angrenzenden Farben darstellen.
4. THE Oberfläche SHALL zwischen Text und Hintergrund ein Kontrastverhältnis von
   mindestens 4,5:1 für normalen Text und mindestens 3:1 für grossen Text (ab
   18,66px fett bzw. ab 24px) einhalten.
5. THE Oberfläche SHALL für grafische Bedienelemente und aussagekräftige Symbole
   (Icons) ein Kontrastverhältnis von mindestens 3:1 gegenüber angrenzenden
   Farben einhalten.
6. WHEN der Nutzer ausschliesslich mit der Tastatur navigiert, THE Oberfläche
   SHALL alle interaktiven Elemente in einer logischen, der visuellen Anordnung
   folgenden Reihenfolge erreichbar und bedienbar machen.
