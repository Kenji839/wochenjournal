# Bugfix Requirements Document

## Introduction

Sobald das Gesamtjournal manuell im Editor bearbeitet oder per KI überarbeitet
wurde, wird eine manuelle Überschreibung (`journalText`) gesetzt. Ab diesem
Zeitpunkt zeigt die Journal-Anzeige (Vorschau, Editor, Kopieren, Download)
ausschliesslich diese eingefrorene Überschreibung an. Nachträgliche Änderungen
an den zugrunde liegenden Feldern – ein neu generierter Tagesabsatz oder eine
neu generierte Reflexion – fliessen nicht mehr in die Anzeige ein. Das Journal
wirkt für den Nutzer "veraltet" und nimmt den neuen Tag bzw. die aktualisierte
Reflexion nicht auf.

Zusätzlich berücksichtigt die Reflexions-Neugenerierung die bereits vorhandene
Reflexion nicht. Existiert schon eine (möglicherweise manuell angepasste)
Reflexion, soll diese beim erneuten Generieren als Kontext mitgegeben werden,
damit manuelle Anpassungen erhalten bleiben und die neue Reflexion die neuen
Tage einbezieht, statt die bisherige zu ignorieren.

Dieses Bugfix adressiert beide ineinandergreifenden Probleme: die veraltete
Journal-Anzeige nach einer manuellen/KI-Bearbeitung und die fehlende
Kontextübergabe der bestehenden Reflexion bei der Neugenerierung.

## Bug Analysis

### Current Behavior (Defect)

Was aktuell passiert, wenn der Bug ausgelöst wird:

1.1 WHEN eine manuelle Überschreibung (`journalText`) gesetzt ist UND danach ein neuer Tagesabsatz generiert oder bearbeitet wird THEN zeigt die Journal-Anzeige weiterhin die eingefrorene Überschreibung ohne den neuen Tag an

1.2 WHEN eine manuelle Überschreibung (`journalText`) gesetzt ist UND danach die Reflexion neu generiert wird THEN zeigt die Journal-Anzeige weiterhin die eingefrorene Überschreibung ohne die aktualisierte Reflexion an

1.3 WHEN die Reflexion neu generiert wird UND bereits eine Reflexion existiert THEN wird die bestehende Reflexion nicht als Kontext mitgeschickt, sodass manuelle Anpassungen an der Reflexion verloren gehen

### Expected Behavior (Correct)

Was stattdessen passieren soll:

2.1 WHEN eine manuelle Überschreibung (`journalText`) gesetzt ist UND danach ein neuer Tagesabsatz generiert oder bearbeitet wird THEN SHALL das System den neuen Tag in der Journal-Anzeige berücksichtigen

2.2 WHEN eine manuelle Überschreibung (`journalText`) gesetzt ist UND danach die Reflexion neu generiert wird THEN SHALL das System die aktualisierte Reflexion in der Journal-Anzeige berücksichtigen

2.3 WHEN die Reflexion neu generiert wird UND bereits eine Reflexion existiert THEN SHALL das System die bestehende Reflexion als Kontext mitschicken, sodass die neue Reflexion die manuellen Anpassungen und die neuen Tage einbezieht

### Unchanged Behavior (Regression Prevention)

Bestehendes Verhalten, das erhalten bleiben muss:

3.1 WHEN keine manuelle Überschreibung gesetzt ist THEN SHALL das System die Journal-Anzeige CONTINUE TO aus den Feldern (Header, Tagesabsätze, Reflexion) ableiten

3.2 WHEN der Nutzer das Gesamtjournal manuell im Editor bearbeitet oder per KI überarbeitet THEN SHALL das System diese Bearbeitung CONTINUE TO als anzeigbaren Journaltext übernehmen

3.3 WHEN die Reflexion neu generiert wird UND noch keine Reflexion existiert THEN SHALL das System CONTINUE TO eine Reflexion aus den Tagesabsätzen und dem Kontext der bis zu drei vorangegangenen Wochen erzeugen

3.4 WHEN ein einzelner Tagesabsatz generiert wird THEN SHALL das System CONTINUE TO die Stichworte des jeweiligen Tages in den Tagesabsatz umsetzen
