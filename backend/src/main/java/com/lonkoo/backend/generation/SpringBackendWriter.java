package com.lonkoo.backend.generation;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Écrit le projet Spring Boot : {@code pom.xml}, entités JPA, dépôts, contrôleurs, migration Flyway,
 * configuration et Dockerfile. Les noms viennent des identifiants validés du contrat, filtrés par {@link Naming} ;
 * le texte libre n'apparaît que dans des commentaires, après {@link Texts#javaComment}.
 */
final class SpringBackendWriter {

    static final String SPRING_BOOT_VERSION = "3.5.16";

    /** Un champ d'une table, avec son nom Java, sa colonne et ses types. */
    record FieldInfo(BlueprintModel.Field field, String javaName, String column, String javaType, String sqlType, boolean json) {
    }

    /** Une table et la classe qui la représente. */
    record EntityInfo(BlueprintModel.Entity entity, BlueprintModel.Block database, String className, String repositoryName,
            String variable, String table, List<FieldInfo> fields) {
    }

    enum Kind { LIST, CREATE, GET, UPDATE, DELETE, STUB }

    /** Une opération HTTP du projet généré (reprise par l'OpenAPI). */
    record Operation(String method, String path, String summary, String operationId, String tag, EntityInfo entity,
            Kind kind, List<String> pathVariables) {
    }

    private static final Pattern VARIABLE = Pattern.compile("\\{([a-z0-9_-]+)}");

    private final BlueprintModel model;
    private final Map<String, String> files;
    private final List<String> warnings;
    private final Set<String> takenClasses = new HashSet<>();
    private final List<EntityInfo> entities = new ArrayList<>();
    private final List<Operation> operations = new ArrayList<>();

    SpringBackendWriter(BlueprintModel model, Map<String, String> files, List<String> warnings) {
        this.model = model;
        this.files = files;
        this.warnings = warnings;
    }

    List<EntityInfo> entities() {
        return entities;
    }

    List<Operation> operations() {
        return operations;
    }

    boolean hasEntities() {
        return !entities.isEmpty();
    }

    void write() {
        List<String> controllerNames = reserveControllerNames();
        resolveEntities();
        writePom();
        writeApplication();
        writeConfiguration();
        writeDockerfile();
        if (hasEntities()) {
            writeMigration();
            entities.forEach(this::writeEntity);
            entities.forEach(this::writeRepository);
            writeErrorHandler();
        }
        writeControllers(controllerNames);
    }

    private String pkgPath() {
        return model.packageName.replace('.', '/');
    }

    private String javaPath(String sub, String className) {
        return "backend/src/main/java/" + pkgPath() + "/" + (sub.isEmpty() ? "" : sub + "/") + className + ".java";
    }

    /* ------------------------------------------------------------------ */
    /* Noms                                                                 */
    /* ------------------------------------------------------------------ */

    private List<String> reserveControllerNames() {
        List<String> names = new ArrayList<>();
        for (BlueprintModel.Block service : model.ofType("service")) {
            names.add(Naming.className(service.name() + "_controller", "Impl", takenClasses));
        }
        return names;
    }

    private static String sqlType(String type) {
        return switch (type) {
            case "string" -> "varchar(255)";
            case "text" -> "text";
            case "integer" -> "integer";
            case "long" -> "bigint";
            case "decimal" -> "numeric(19,4)";
            case "boolean" -> "boolean";
            case "date" -> "date";
            case "datetime" -> "timestamptz";
            case "uuid" -> "uuid";
            case "json" -> "jsonb";
            default -> throw new IllegalStateException("Type de champ inconnu : " + type);
        };
    }

    private static String javaType(String type) {
        return switch (type) {
            case "string", "text" -> "String";
            case "json" -> "Map<String, Object>";
            case "integer" -> "Integer";
            case "long" -> "Long";
            case "decimal" -> "BigDecimal";
            case "boolean" -> "Boolean";
            case "date" -> "LocalDate";
            case "datetime" -> "Instant";
            case "uuid" -> "UUID";
            default -> throw new IllegalStateException("Type de champ inconnu : " + type);
        };
    }

    private void resolveEntities() {
        List<BlueprintModel.Entity> all = model.entities();
        Map<String, Long> occurrences = new java.util.HashMap<>();
        all.forEach(e -> occurrences.merge(e.name(), 1L, Long::sum));
        Set<String> tables = new HashSet<>();

        for (BlueprintModel.Entity entity : all) {
            boolean shared = occurrences.get(entity.name()) > 1;
            String table = Naming.unique(shared ? entity.database() + "_" + entity.name() : entity.name(), tables);

            String className = allocateEntityClass(entity.name());
            Set<String> javaNames = new HashSet<>(Set.of("id"));
            Set<String> columns = new HashSet<>(Set.of("id"));
            List<FieldInfo> fields = new ArrayList<>();
            for (BlueprintModel.Field field : entity.fields()) {
                String column = field.name();
                if (columns.contains(column)) {
                    column = Naming.unique(field.name() + "_value", columns);
                    warnings.add("Le champ « " + field.name() + " » de la table « " + entity.name()
                            + " » est devenu la colonne « " + column + " » (« id » est la clé primaire générée).");
                } else {
                    columns.add(column);
                }
                String camel = Naming.camel(field.name());
                String javaName = Naming.unique(camel.equals("id") ? "idValue" : camel, javaNames);
                fields.add(new FieldInfo(field, javaName, column, javaType(field.type()), sqlType(field.type()), field.type().equals("json")));
            }
            BlueprintModel.Block database = model.ofType("database").stream()
                    .filter(block -> block.name().equals(entity.database())).findFirst().orElseThrow();
            entities.add(new EntityInfo(entity, database, className, className + "Repository",
                    Character.toLowerCase(className.charAt(0)) + className.substring(1), table, List.copyOf(fields)));
        }
    }

    /** Une classe libre dont le dépôt ({@code …Repository}) l'est aussi : les deux se retrouvent importés ensemble. */
    private String allocateEntityClass(String ident) {
        String base = Naming.pascal(ident);
        for (int attempt = 0; ; attempt++) {
            String candidate = base + (attempt == 0 ? "" : attempt == 1 ? "Entity" : "Entity" + attempt);
            if (!Naming.isTaken(candidate, takenClasses) && !Naming.isTaken(candidate + "Repository", takenClasses)) {
                takenClasses.add(candidate);
                takenClasses.add(candidate + "Repository");
                return candidate;
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /* Fichiers de configuration                                            */
    /* ------------------------------------------------------------------ */

    private void writePom() {
        StringBuilder pom = new StringBuilder();
        pom.append("""
                <?xml version="1.0" encoding="UTF-8"?>
                <project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
                    <modelVersion>4.0.0</modelVersion>

                    <parent>
                        <groupId>org.springframework.boot</groupId>
                        <artifactId>spring-boot-starter-parent</artifactId>
                        <version>%s</version>
                        <relativePath/>
                    </parent>

                    <groupId>com.example</groupId>
                    <artifactId>%s-backend</artifactId>
                    <version>0.1.0</version>
                    <name>%s</name>
                    <description>API du projet %s, générée par LONKOO.</description>

                    <properties>
                        <java.version>21</java.version>
                    </properties>

                    <dependencies>
                        <dependency>
                            <groupId>org.springframework.boot</groupId>
                            <artifactId>spring-boot-starter-web</artifactId>
                        </dependency>
                        <dependency>
                            <groupId>org.springframework.boot</groupId>
                            <artifactId>spring-boot-starter-actuator</artifactId>
                        </dependency>
                """.formatted(SPRING_BOOT_VERSION, model.slug, Texts.xml(model.displayName, 80), Texts.xml(model.displayName, 80)));
        if (hasEntities()) {
            pom.append("""
                            <dependency>
                                <groupId>org.springframework.boot</groupId>
                                <artifactId>spring-boot-starter-data-jpa</artifactId>
                            </dependency>
                            <dependency>
                                <groupId>org.springframework.boot</groupId>
                                <artifactId>spring-boot-starter-validation</artifactId>
                            </dependency>
                            <dependency>
                                <groupId>org.flywaydb</groupId>
                                <artifactId>flyway-core</artifactId>
                            </dependency>
                            <dependency>
                                <groupId>org.flywaydb</groupId>
                                <artifactId>flyway-database-postgresql</artifactId>
                            </dependency>
                            <dependency>
                                <groupId>org.postgresql</groupId>
                                <artifactId>postgresql</artifactId>
                                <scope>runtime</scope>
                            </dependency>
                    """);
        }
        pom.append("""
                    </dependencies>

                    <build>
                        <plugins>
                            <plugin>
                                <groupId>org.springframework.boot</groupId>
                                <artifactId>spring-boot-maven-plugin</artifactId>
                            </plugin>
                        </plugins>
                    </build>
                </project>
                """);
        files.put("backend/pom.xml", pom.toString());
    }

    private void writeApplication() {
        files.put(javaPath("", "Application"), """
                package %s;

                import org.springframework.boot.SpringApplication;
                import org.springframework.boot.autoconfigure.SpringBootApplication;

                /** Point d'entrée de l'API (généré par LONKOO). */
                @SpringBootApplication
                public class Application {

                    public static void main(String[] args) {
                        SpringApplication.run(Application.class, args);
                    }
                }
                """.formatted(model.packageName));
    }

    private void writeConfiguration() {
        StringBuilder yml = new StringBuilder("""
                # Configuration de l'API (générée par LONKOO). Les valeurs viennent de l'environnement.
                server:
                  port: 8080

                management:
                  endpoints:
                    web:
                      exposure:
                        include: health
                """);
        if (hasEntities()) {
            yml.append("""

                    spring:
                      datasource:
                        url: ${DB_URL:jdbc:postgresql://localhost:5432/app}
                        username: ${DB_USER:postgres}
                        password: ${DB_PASSWORD:postgres}
                      jpa:
                        open-in-view: false
                        hibernate:
                          ddl-auto: validate
                      flyway:
                        enabled: true

                    logging:
                      level:
                        # Un doublon est une erreur du client, traduite en 409 : pas d'ERROR dans le journal (« OFF » entre guillemets :
                        # YAML 1.1 lit off comme faux).
                        org.hibernate.engine.jdbc.spi.SqlExceptionHelper: "OFF"
                    """);
        }
        files.put("backend/src/main/resources/application.yml", yml.toString());
    }

    private void writeDockerfile() {
        files.put("backend/Dockerfile", """
                # Étape 1 : construction
                FROM maven:3.9-eclipse-temurin-21 AS build
                WORKDIR /workspace
                COPY pom.xml .
                RUN mvn -B -q dependency:go-offline
                COPY src src
                RUN mvn -B -q -DskipTests package

                # Étape 2 : exécution avec un JRE, utilisateur non root
                FROM eclipse-temurin:21-jre
                WORKDIR /app
                RUN useradd --system --uid 10001 --create-home app
                COPY --from=build /workspace/target/*.jar app.jar
                USER app:app
                EXPOSE 8080
                ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
                """);
        files.put("backend/.dockerignore", "target\n.git\n*.log\n");
    }

    /* ------------------------------------------------------------------ */
    /* Base de données : migration, entités, dépôts                         */
    /* ------------------------------------------------------------------ */

    private void writeMigration() {
        StringBuilder sql = new StringBuilder("-- Schéma initial généré par LONKOO à partir des blocs « base de données » du canvas.\n");
        for (EntityInfo entity : entities) {
            sql.append("\n-- Table « ").append(entity.table()).append(" » du bloc « ")
                    .append(Texts.plain(entity.database().title(), 80)).append(" »\n");
            sql.append("create table ").append(entity.table()).append(" (\n");
            sql.append("    id uuid primary key default gen_random_uuid()");
            for (FieldInfo field : entity.fields()) {
                sql.append(",\n    ").append(field.column()).append(' ').append(field.sqlType());
                if (field.field().required()) {
                    sql.append(" not null");
                }
                if (field.field().unique()) {
                    sql.append(" unique");
                }
            }
            sql.append("\n);\n");
        }
        files.put("backend/src/main/resources/db/migration/V1__schema_initial.sql", sql.toString());
    }

    private void writeEntity(EntityInfo entity) {
        Set<String> imports = new TreeSet<>(List.of(
                "jakarta.persistence.Column", "jakarta.persistence.Entity", "jakarta.persistence.GeneratedValue",
                "jakarta.persistence.GenerationType", "jakarta.persistence.Id", "jakarta.persistence.Table", "java.util.UUID"));
        for (FieldInfo field : entity.fields()) {
            switch (field.javaType()) {
                case "BigDecimal" -> imports.add("java.math.BigDecimal");
                case "LocalDate" -> imports.add("java.time.LocalDate");
                case "Instant" -> imports.add("java.time.Instant");
                case "Map<String, Object>" -> imports.add("java.util.Map");
                default -> { }
            }
            if (field.json()) {
                imports.add("org.hibernate.annotations.JdbcTypeCode");
                imports.add("org.hibernate.type.SqlTypes");
            }
            if (field.field().required()) {
                imports.add("jakarta.validation.constraints." + (isText(field) ? "NotBlank" : "NotNull"));
            }
        }

        StringBuilder java = new StringBuilder();
        java.append("package ").append(model.packageName).append(".domain;\n\n");
        imports.forEach(name -> java.append("import ").append(name).append(";\n"));
        java.append("\n/** Table « ").append(Texts.javaComment(entity.entity().name(), 40)).append(" » du bloc « ")
                .append(Texts.javaComment(entity.database().title(), 80)).append(" » (généré par LONKOO). */\n");
        java.append("@Entity\n@Table(name = ").append(Texts.javaString(entity.table())).append(")\n");
        java.append("public class ").append(entity.className()).append(" {\n\n");
        java.append("    @Id\n    @GeneratedValue(strategy = GenerationType.UUID)\n    private UUID id;\n");
        for (FieldInfo field : entity.fields()) {
            java.append('\n');
            if (field.field().required()) {
                // Refusé avec un 400 qui nomme le champ, avant d'atteindre la base (voir ApiErrorHandler).
                java.append("    @").append(isText(field) ? "NotBlank" : "NotNull").append("(message = \"est obligatoire\")\n");
            }
            java.append("    @Column(name = ").append(Texts.javaString(field.column()));
            if (field.field().required()) {
                java.append(", nullable = false");
            }
            if (field.field().unique()) {
                java.append(", unique = true");
            }
            java.append(")\n");
            if (field.json()) {
                java.append("    @JdbcTypeCode(SqlTypes.JSON)\n");
            }
            java.append("    private ").append(field.javaType()).append(' ').append(field.javaName()).append(";\n");
        }
        java.append("\n    public UUID getId() {\n        return id;\n    }\n\n    public void setId(UUID id) {\n        this.id = id;\n    }\n");
        for (FieldInfo field : entity.fields()) {
            String accessor = Naming.pascal(field.javaName());
            java.append("\n    public ").append(field.javaType()).append(" get").append(accessor).append("() {\n        return ")
                    .append(field.javaName()).append(";\n    }\n");
            java.append("\n    public void set").append(accessor).append('(').append(field.javaType()).append(' ').append(field.javaName())
                    .append(") {\n        this.").append(field.javaName()).append(" = ").append(field.javaName()).append(";\n    }\n");
        }
        java.append("}\n");
        files.put(javaPath("domain", entity.className()), java.toString());
    }

    /** Un texte obligatoire ne doit pas non plus être vide ; les autres types seulement présents. */
    private static boolean isText(FieldInfo field) {
        return "String".equals(field.javaType());
    }

    private void writeRepository(EntityInfo entity) {
        files.put(javaPath("repository", entity.repositoryName()), """
                package %s.repository;

                import %s.domain.%s;
                import java.util.UUID;
                import org.springframework.data.jpa.repository.JpaRepository;

                /** Accès à la table « %s » (généré par LONKOO). */
                public interface %s extends JpaRepository<%s, UUID> {
                }
                """.formatted(model.packageName, model.packageName, entity.className(),
                Texts.javaComment(entity.entity().name(), 40), entity.repositoryName(), entity.className()));
    }

    /**
     * Un champ obligatoire absent ou vide est refusé avec un 400 qui nomme le champ ; une contrainte de la base (valeur en
     * double, par exemple) est une erreur du client aussi : 409, pas 500.
     */
    private void writeErrorHandler() {
        files.put(javaPath("web", "ApiErrorHandler"), """
                package %s.web;

                import java.util.Map;
                import java.util.TreeMap;
                import org.springframework.dao.DataIntegrityViolationException;
                import org.springframework.http.HttpStatus;
                import org.springframework.http.ResponseEntity;
                import org.springframework.web.bind.MethodArgumentNotValidException;
                import org.springframework.web.bind.annotation.ExceptionHandler;
                import org.springframework.web.bind.annotation.RestControllerAdvice;

                /** Traduit les refus de validation et de la base de données en réponses HTTP lisibles (généré par LONKOO). */
                @RestControllerAdvice
                public class ApiErrorHandler {

                    @ExceptionHandler(MethodArgumentNotValidException.class)
                    public ResponseEntity<Map<String, Object>> invalid(MethodArgumentNotValidException e) {
                        Map<String, String> fields = new TreeMap<>();
                        e.getBindingResult().getFieldErrors()
                                .forEach(error -> fields.putIfAbsent(error.getField(), String.valueOf(error.getDefaultMessage())));
                        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                                .body(Map.of("detail", "Données invalides : un champ obligatoire manque ou est vide.", "champs", fields));
                    }

                    @ExceptionHandler(DataIntegrityViolationException.class)
                    public ResponseEntity<Map<String, String>> conflict() {
                        return ResponseEntity.status(HttpStatus.CONFLICT)
                                .body(Map.of("detail", "Donnée refusée : valeur déjà utilisée ou contrainte de la base non respectée."));
                    }
                }
                """.formatted(model.packageName));
    }

    /* ------------------------------------------------------------------ */
    /* Contrôleurs                                                          */
    /* ------------------------------------------------------------------ */

    /** Chemin sans le nom des variables : {@code /a/{x}} et {@code /a/{y}} sont le même chemin pour Spring. */
    private static String shape(String path) {
        return VARIABLE.matcher(path).replaceAll("{}");
    }

    private EntityInfo entityForSegment(String segment) {
        String normalized = segment.replace('-', '_');
        for (String candidate : List.of(normalized, strip(normalized, "s"), strip(normalized, "es"), strip(normalized, "x"))) {
            for (EntityInfo entity : entities) {
                if (entity.entity().name().equals(candidate)) {
                    return entity;
                }
            }
        }
        return null;
    }

    private static String strip(String text, String suffix) {
        return text.endsWith(suffix) && text.length() > suffix.length() ? text.substring(0, text.length() - suffix.length()) : text;
    }

    private void writeControllers(List<String> controllerNames) {
        Set<String> seen = new LinkedHashSet<>();
        List<BlueprintModel.Block> services = model.ofType("service");
        for (int i = 0; i < services.size(); i++) {
            BlueprintModel.Block service = services.get(i);
            String controller = controllerNames.get(i);
            Set<String> methodNames = new HashSet<>();
            List<Operation> mine = new ArrayList<>();

            for (BlueprintModel.Endpoint endpoint : model.endpoints(service)) {
                String key = endpoint.method() + " " + shape(endpoint.path());
                if (!seen.add(key)) {
                    warnings.add("L'endpoint " + endpoint.method() + " " + endpoint.path() + " du bloc « " + service.name()
                            + " » existe déjà : il est ignoré (Spring refuserait de démarrer avec deux routes identiques).");
                    continue;
                }
                mine.add(operation(service, endpoint, methodNames));
            }
            operations.addAll(mine);
            files.put(javaPath("web", controller), controllerSource(service, controller, mine));
        }
    }

    private Operation operation(BlueprintModel.Block service, BlueprintModel.Endpoint endpoint, Set<String> methodNames) {
        List<String> segments = new ArrayList<>();
        for (String part : endpoint.path().split("/")) {
            if (!part.isEmpty()) {
                segments.add(part);
            }
        }
        List<String> variables = new ArrayList<>();
        StringBuilder name = new StringBuilder(endpoint.method().toLowerCase());
        for (String segment : segments) {
            Matcher matcher = VARIABLE.matcher(segment);
            if (matcher.matches()) {
                variables.add(matcher.group(1));
                name.append("By").append(Naming.pascal(Naming.camelFromSegments(matcher.group(1))));
            } else {
                name.append(Naming.pascal(Naming.camelFromSegments(segment)));
            }
        }
        String operationId = Naming.unique(name.toString(), methodNames);

        EntityInfo entity = null;
        Kind kind = Kind.STUB;
        if (!segments.isEmpty() && !VARIABLE.matcher(segments.get(0)).matches()) {
            entity = entityForSegment(segments.get(0));
            if (entity != null && segments.size() == 1) {
                kind = switch (endpoint.method()) {
                    case "GET" -> Kind.LIST;
                    case "POST" -> Kind.CREATE;
                    default -> Kind.STUB;
                };
            } else if (entity != null && segments.size() == 2 && VARIABLE.matcher(segments.get(1)).matches()) {
                kind = switch (endpoint.method()) {
                    case "GET" -> Kind.GET;
                    case "PUT", "PATCH" -> Kind.UPDATE;
                    case "DELETE" -> Kind.DELETE;
                    default -> Kind.STUB;
                };
            }
            if (kind == Kind.STUB) {
                entity = null;
            }
        }
        return new Operation(endpoint.method(), endpoint.path(), endpoint.summary(), operationId, service.name(), entity, kind, variables);
    }

    private String controllerSource(BlueprintModel.Block service, String controller, List<Operation> operations) {
        Set<String> imports = new TreeSet<>(List.of("org.springframework.web.bind.annotation.RestController"));
        Set<EntityInfo> used = new LinkedHashSet<>();
        boolean stubs = false;
        for (Operation op : operations) {
            imports.add("org.springframework.web.bind.annotation." + Naming.pascal(op.method().toLowerCase()) + "Mapping");
            if (op.entity() != null) {
                used.add(op.entity());
                imports.add(model.packageName + ".domain." + op.entity().className());
                imports.add(model.packageName + ".repository." + op.entity().repositoryName());
            }
            switch (op.kind()) {
                case LIST -> imports.add("java.util.List");
                case CREATE -> {
                    imports.add("jakarta.validation.Valid");
                    imports.add("org.springframework.web.bind.annotation.RequestBody");
                    imports.add("org.springframework.web.bind.annotation.ResponseStatus");
                    imports.add("org.springframework.http.HttpStatus");
                }
                case GET -> {
                    imports.addAll(List.of("java.util.UUID", "org.springframework.web.bind.annotation.PathVariable",
                            "org.springframework.web.server.ResponseStatusException", "org.springframework.http.HttpStatus"));
                }
                case UPDATE -> {
                    imports.addAll(List.of("java.util.UUID", "org.springframework.web.bind.annotation.PathVariable",
                            "jakarta.validation.Valid", "org.springframework.web.bind.annotation.RequestBody",
                            "org.springframework.web.server.ResponseStatusException", "org.springframework.http.HttpStatus"));
                }
                case DELETE -> {
                    imports.addAll(List.of("java.util.UUID", "org.springframework.web.bind.annotation.PathVariable",
                            "org.springframework.web.bind.annotation.ResponseStatus",
                            "org.springframework.web.server.ResponseStatusException", "org.springframework.http.HttpStatus"));
                }
                case STUB -> {
                    stubs = true;
                    if (!op.pathVariables().isEmpty()) {
                        imports.add("org.springframework.web.bind.annotation.PathVariable");
                    }
                }
            }
        }
        if (stubs) {
            imports.addAll(List.of("java.util.Map", "org.springframework.http.HttpStatus", "org.springframework.http.ResponseEntity"));
        }

        StringBuilder java = new StringBuilder();
        java.append("package ").append(model.packageName).append(".web;\n\n");
        imports.forEach(name -> java.append("import ").append(name).append(";\n"));
        java.append("\n/** Endpoints du bloc « ").append(Texts.javaComment(service.title(), 80)).append(" » (généré par LONKOO). */\n");
        java.append("@RestController\npublic class ").append(controller).append(" {\n");

        if (!used.isEmpty()) {
            java.append('\n');
            for (EntityInfo entity : used) {
                java.append("    private final ").append(entity.repositoryName()).append(' ').append(entity.variable()).append("Repository;\n");
            }
            java.append("\n    public ").append(controller).append('(');
            java.append(String.join(", ", used.stream().map(e -> e.repositoryName() + " " + e.variable() + "Repository").toList()));
            java.append(") {\n");
            for (EntityInfo entity : used) {
                java.append("        this.").append(entity.variable()).append("Repository = ").append(entity.variable()).append("Repository;\n");
            }
            java.append("    }\n");
        }

        for (Operation op : operations) {
            java.append('\n');
            appendOperation(java, op);
        }
        if (stubs) {
            java.append("""

                        private static ResponseEntity<Map<String, String>> notImplemented(String operation) {
                            return ResponseEntity.status(HttpStatus.NOT_IMPLEMENTED).body(Map.of("detail", "À implémenter : " + operation));
                        }
                    """);
        }
        java.append("}\n");
        return java.toString();
    }

    private void appendOperation(StringBuilder java, Operation op) {
        String summary = op.summary() != null && !op.summary().isBlank() ? Texts.javaComment(op.summary(), 80) : op.method() + " " + op.path();
        String mapping = Naming.pascal(op.method().toLowerCase()) + "Mapping";
        java.append("    /** ").append(summary).append(" */\n");
        java.append("    @").append(mapping).append('(').append(Texts.javaString(op.path())).append(")\n");
        EntityInfo entity = op.entity();
        String repo = entity == null ? "" : entity.variable() + "Repository";
        String idVariable = "id";
        String idAnnotation = op.pathVariables().isEmpty() ? "" : "@PathVariable(" + Texts.javaString(op.pathVariables().get(0)) + ") UUID id";

        switch (op.kind()) {
            case LIST -> java.append("    public List<").append(entity.className()).append("> ").append(op.operationId()).append("() {\n")
                    .append("        return ").append(repo).append(".findAll();\n    }\n");
            case CREATE -> java.append("    @ResponseStatus(HttpStatus.CREATED)\n    public ").append(entity.className()).append(' ')
                    .append(op.operationId()).append("(@Valid @RequestBody ").append(entity.className()).append(" body) {\n")
                    .append("        body.setId(null);\n        return ").append(repo).append(".save(body);\n    }\n");
            case GET -> java.append("    public ").append(entity.className()).append(' ').append(op.operationId()).append('(')
                    .append(idAnnotation).append(") {\n        return ").append(repo).append(".findById(").append(idVariable).append(")\n")
                    .append("                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));\n    }\n");
            case UPDATE -> java.append("    public ").append(entity.className()).append(' ').append(op.operationId()).append('(')
                    .append(idAnnotation).append(", @Valid @RequestBody ").append(entity.className()).append(" body) {\n")
                    .append("        if (!").append(repo).append(".existsById(").append(idVariable).append(")) {\n")
                    .append("            throw new ResponseStatusException(HttpStatus.NOT_FOUND);\n        }\n")
                    .append("        body.setId(").append(idVariable).append(");\n        return ").append(repo).append(".save(body);\n    }\n");
            case DELETE -> java.append("    @ResponseStatus(HttpStatus.NO_CONTENT)\n    public void ").append(op.operationId()).append('(')
                    .append(idAnnotation).append(") {\n        if (!").append(repo).append(".existsById(").append(idVariable).append(")) {\n")
                    .append("            throw new ResponseStatusException(HttpStatus.NOT_FOUND);\n        }\n        ")
                    .append(repo).append(".deleteById(").append(idVariable).append(");\n    }\n");
            case STUB -> {
                Set<String> params = new HashSet<>();
                List<String> declared = new ArrayList<>();
                for (String variable : op.pathVariables()) {
                    declared.add("@PathVariable(" + Texts.javaString(variable) + ") String "
                            + Naming.unique(Naming.camelFromSegments(variable), params));
                }
                java.append("    public ResponseEntity<Map<String, String>> ").append(op.operationId()).append('(')
                        .append(String.join(", ", declared)).append(") {\n        return notImplemented(")
                        .append(Texts.javaString(op.method() + " " + op.path())).append(");\n    }\n");
            }
        }
    }
}
