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
  "all", "alter", "analyse", "analyze", "and", "any", "array", "as", "asc", "asymmetric",
  "authorization", "begin", "between", "binary", "both", "by", "cast", "check", "collate", "collation",
  "column", "commit", "concurrently", "constraint", "create", "cross", "current_catalog",
  "current_date", "current_role", "current_schema", "current_time", "current_timestamp",
  "current_user", "database", "deferrable", "delete", "desc", "distinct", "do", "drop", "else", "end",
  "except", "exists", "false", "fetch", "for", "foreign", "freeze", "from", "full", "grant", "group",
  "having", "ilike", "in", "index", "initially", "inner", "insert", "intersect", "into", "is",
  "isnull", "join", "key", "lateral", "leading", "left", "like", "limit", "localtime",
  "localtimestamp", "natural", "not", "notnull", "null", "offset", "on", "only", "or", "order",
  "outer", "overlaps", "placing", "primary", "references", "returning", "right", "rollback", "schema",
  "select", "session_user", "set", "similar", "some", "symmetric", "system_user", "table",
  "tablesample", "then", "to", "trailing", "trigger", "true", "union", "unique", "update", "user",
  "using", "values", "variadic", "verbose", "view", "when", "where", "window", "with",
];

const YAML = ["true", "false", "null", "yes", "no", "on", "off", "y", "n"];

export const RESERVED_WORD_LISTS = { java: JAVA, sql: SQL, yaml: YAML } as const;

const RESERVED = new Set<string>([...JAVA, ...SQL, ...YAML]);

export function isReserved(identifier: string): boolean {
  return RESERVED.has(identifier);
}
