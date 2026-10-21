/**
 * Mots qu'un identifiant technique (`name` d'un bloc) ne peut pas porter : ils finiraient tels quels dans
 * du code Java, une table SQL ou un fichier YAML générés (docs/schema-canvas.md).
 *
 * Copie de `backend/.../canvas/ReservedWords.java`, qui fait foi : le test `reserved-words.test.ts`
 * échoue si les deux listes divergent.
 */

const JAVA = [
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const",
  "continue", "default", "do", "double", "else", "enum", "extends", "final", "finally", "float",
  "for", "goto", "if", "implements", "import", "instanceof", "int", "interface", "long", "native",
  "new", "package", "private", "protected", "public", "return", "short", "static", "strictfp",
  "super", "switch", "synchronized", "this", "throw", "throws", "transient", "try", "void",
  "volatile", "while", "true", "false", "null", "record", "var", "yield", "sealed", "permits",
];

const SQL = [
  "all", "alter", "analyse", "analyze", "and", "any", "array", "as", "asc", "begin", "between",
  "by", "cast", "check", "collate", "column", "commit", "constraint", "create", "cross",
  "current_date", "current_time", "current_timestamp", "current_user", "database", "delete",
  "desc", "distinct", "drop", "else", "end", "except", "exists", "false", "fetch", "for",
  "foreign", "from", "full", "grant", "group", "having", "in", "index", "inner", "insert",
  "intersect", "into", "is", "join", "key", "left", "like", "limit", "natural", "not", "null",
  "offset", "on", "or", "order", "outer", "primary", "references", "right", "rollback", "schema",
  "select", "session_user", "set", "some", "table", "then", "to", "trigger", "true", "union",
  "unique", "update", "user", "using", "values", "view", "when", "where", "with",
];

const YAML = ["true", "false", "null", "yes", "no", "on", "off", "y", "n"];

export const RESERVED_WORD_LISTS = { java: JAVA, sql: SQL, yaml: YAML } as const;

const RESERVED = new Set<string>([...JAVA, ...SQL, ...YAML]);

export function isReserved(identifier: string): boolean {
  return RESERVED.has(identifier);
}
