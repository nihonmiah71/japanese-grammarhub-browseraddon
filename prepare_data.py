import os
import re
import json
import pandas as pd

TSV_FILE = "simplegrammarregex_fixed.tsv"
OUT_GRAMMAR = "grammar_data.json"
OUT_PATTERNS = "patterns_data.json"

def expand_regex_options(pattern_str):
    """
    Löst komplexe, beliebig tief verschachtelte Regex-Optionen wie (?:A|B) oder (A|B) 
    schrittweise von innen nach außen in einzelne Plain-Text-Kombinationen auf.
    Unterstützt auch optionale Gruppen wie (?:A|B)? oder (A|B)?, indem ein leerer 
    String als Option eingebaut wird.
    """
    if not pattern_str or pd.isna(pattern_str):
        return []
        
    pattern_str = str(pattern_str).strip()
    
    # Vorbereitung: Bereinige einfache Zeichenklassen wie [むぐ...] falls vorhanden,
    # und wandle sie in Standard-Gruppen (?:む|ぐ|...) um, um sie einheitlich aufzulösen.
    def replace_char_class(match):
        chars = match.group(1)
        # Verhindert das Aufspalten von vordefinierten Regex-Klassen wie \s
        if chars.startswith('\\'):
            return match.group(0)
        return '(?:' + '|'.join(list(chars)) + ')'
    
    # Verarbeitet nur echte Zeichenlisten, nicht komplexe Ausschlüsse wie [^\s]
    if '[' in pattern_str and '^' not in pattern_str:
        pattern_str = re.sub(r'\[([^\]]+)\]', replace_char_class, pattern_str)

    def expand_step(text):
        # Findet die am tiefsten verschachtelte Gruppe, die KEINE weiteren Klammern enthält.
        # Erkennt optionale Gruppen mit einem optionalen '?' direkt hinter der schließenden Klammer.
        match = re.search(r'\(\?(?::)?([^()]*)\)(\?)?|\(([^()]*)\)(\?)?', text)
        if not match:
            # Wenn keine Gruppen mehr vorhanden sind, prüfen wir auf verbleibende Top-Level-Oder
            if '|' in text:
                return [opt.strip() for opt in text.split('|') if opt.strip()]
            return [text]
        
        start, end = match.span()
        
        # Bestimmen, welche Regex-Gruppe gematcht hat, und ob ein '?' anhängt
        if match.group(1) is not None:
            inner_content = match.group(1)
            is_optional = match.group(2) == '?'
        else:
            inner_content = match.group(3)
            is_optional = match.group(4) == '?'
            
        # Teile die Alternativen der innersten Gruppe auf
        alternatives = [opt.strip() for opt in inner_content.split('|') if opt.strip()]
        if is_optional:
            # Leere Option hinzufügen, falls die Gruppe durch ein '?' optional war
            alternatives.append("")
            
        results = []
        prefix = text[:start]
        suffix = text[end:]
        
        for alt in alternatives:
            # Kombiniere den Text vor und nach der Gruppe mit der extrahierten Alternative
            combined = prefix + alt + suffix
            # Rekursiver Aufruf, um verbleibende äußere oder parallele Gruppen aufzulösen
            results.extend(expand_step(combined))
            
        return results

    # Starte den rekursiven Prozess
    expanded_patterns = expand_step(pattern_str)
    
    # Duplikate entfernen unter Beibehaltung der Reihenfolge
    unique_patterns = []
    for p in expanded_patterns:
        # Falls durch optionale Gruppen doppelte Leerzeichen oder leere Patterns entstehen
        p_cleaned = p.strip()
        if p_cleaned and p_cleaned not in unique_patterns:
            unique_patterns.append(p_cleaned)
            
    return unique_patterns

def calculate_max_length_score(pattern_str):
    """
    Berechnet die maximale potenzielle Match-Länge eines flachen Patterns.
    Blöcke wie {1,15} werden mit 15 Einheiten bewertet.
    """
    score = 0
    temp_str = pattern_str
    
    # 1. Finde alle Quantifikatoren der Form {X,Y} und addiere das Maximum Y zum Score
    quantifiers = re.findall(r'\{\d+,(\d+)\}', temp_str)
    for q in quantifiers:
        score += int(q)
        
    # 2. Entferne die Quantifikatoren {X,Y} aus dem temporären String
    temp_str = re.sub(r'\{\d+,\d+\}', '', temp_str)
    
    # 3. Entferne Zeichenklassen in eckigen Klammern (z.B. [^\s。？！]) komplett
    temp_str = re.sub(r'\[[^\]]+\]', '', temp_str)
    
    # 4. Entferne verbleibende reine Regex-Steuerzeichen, die keine Textlänge haben
    temp_str = re.sub(r'[\(\)\?\+\*^$]', '', temp_str)
    
    # 5. Die verbleibenden Zeichen sind literaler Text (z.B. japanische Zeichen) -> Länge addieren
    score += len(temp_str)
    return score

def main():
    if not os.path.exists(TSV_FILE):
        print(f"Fehler: {TSV_FILE} wurde nicht im aktuellen Ordner gefunden!")
        return

    print("Lese original TSV-Datei ein...")
    df = pd.read_csv(TSV_FILE, sep='\t').fillna('')
    
    grammar_dict = {}
    pattern_to_nids = {}
    
    for _, row in df.iterrows():
        nid = str(row['nid']).strip()
        if not nid or nid == 'nan':
            continue
            
        # 🚀 HIER PASSIERT DIE MAGIE: Exakt die alten Bezeichner PLUS das neue regexpattern-Feld!
        grammar_dict[nid] = {
            "nid": nid,
            "tags": row.get('tags', ''),
            "level_and_point": row.get('Level And Grammar Point', ''),
            "link": row.get('Link', ''),
            "construction": row.get('construction', ''),
            "examplesentences": row.get('examplesentences', ''),
            "regexpattern": row.get('regexpattern', '')  # <--- REGEX WIRD FÜR JEDES ITEM GESPEICHERT!
        }
        
        # 2. Regex auslesen und in flache Einzel-Patterns aufspalten
        raw_regex = row.get('regexpattern', '')
        flat_patterns = expand_regex_options(raw_regex)
        
        # M:N Verknüpfung aufbauen (Pattern -> Liste von NIDs)
        for pat in flat_patterns:
            if pat not in pattern_to_nids:
                pattern_to_nids[pat] = set()
            pattern_to_nids[pat].add(nid)
            
    # 3. Längen-Scores für die Konfliktvermeidung berechnen
    processed_patterns = []
    for pat, nids in pattern_to_nids.items():
        score = calculate_max_length_score(pat)
        processed_patterns.append({
            "pattern": pat,
            "length_score": score,
            "nids": list(nids)
        })
        
    # 4. Sortierung: Größter Score (längstes potenzielles Match) zuerst!
    processed_patterns.sort(key=lambda x: x['length_score'], reverse=True)
    
    # 5. Als statische JSON-Dateien exportieren
    with open(OUT_GRAMMAR, 'w', encoding='utf-8') as f:
        json.dump(grammar_dict, f, ensure_ascii=False, indent=2)
        
    with open(OUT_PATTERNS, 'w', encoding='utf-8') as f:
        json.dump(processed_patterns, f, ensure_ascii=False, indent=2)
        
    print("\n--- Vorbereitung erfolgreich abgeschlossen! ---")
    print(f"-> {OUT_GRAMMAR} erstellt ({len(grammar_dict)} Grammatikpunkte für Popups)")
    print(f"-> {OUT_PATTERNS} erstellt ({len(processed_patterns)} eindeutige, sortierte Patterns für die Suche)")

if __name__ == "__main__":
    main()