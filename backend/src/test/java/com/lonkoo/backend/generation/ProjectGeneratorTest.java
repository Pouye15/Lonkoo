package com.lonkoo.backend.generation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.io.IOException;
import java.io.StringReader;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

import javax.tools.Diagnostic;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.SimpleJavaFileObject;
import javax.tools.ToolProvider;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.w3c.dom.Document;
import org.xml.sax.InputSource;
import org.yaml.snakeyaml.Yaml;

import com.lonkoo.backend.canvas.CanvasJsonValidator;
import com.lonkoo.backend.canvas.CanvasValidator;
import com.lonkoo.backend.canvas.InvalidCanvasException;
import com.sun.source.tree.ClassTree;
import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.VariableTree;
import com.sun.source.util.JavacTask;
import com.sun.source.util.TreeScanner;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Le générateur de projet, sur l'exemple {@code marketplace-mobile} et sur des canvas hostiles. Le code Java produit
 * est lu par l'analyseur de {@code javac}, les fichiers YAML et XML par leurs analyseurs, le SQL est exécuté sur un
 * vrai PostgreSQL : un fichier qui ne passe pas ne part pas sur GitHub.
 */
class ProjectGeneratorTest {

    private final ProjectGenerator generator = new ProjectGenerator(new CanvasValidator(new CanvasJsonValidator()));
    private final JsonMapper json = JsonMapper.shared();

    private JsonNode example() throws IOException {
        return json.readTree(new ClassPathResource("seed/marketplace-mobile.canvas.json").getInputStream());
    }

    private JsonNode snapshot(String nodes, String edges) {
        return json.readTree("{\"schemaVersion\":1,\"nodes\":[" + nodes + "],\"edges\":[" + edges + "]}");
    }

    private static String node(String id, String type, String data) {
        return "{\"id\":\"" + id + "\",\"type\":\"" + type + "\",\"position\":{\"x\":0,\"y\":0},\"data\":" + data + "}";
    }

    private static String text(String value) {
        return JsonMapper.shared().writeValueAsString(value);
    }

    // ------------------------------------------------------------------ Outils d'analyse

    private record JavaAnalysis(List<String> errors, Set<String> invocations, Set<String> classes, Set<String> fields) {
    }

    /** Lit tout le Java produit avec l'analyseur de javac (syntaxe seulement : pas de classpath). */
    private static JavaAnalysis analyzeJava(Map<String, String> files) throws IOException {
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
        List<JavaFileObject> units = new ArrayList<>();
        files.forEach((path, content) -> {
            if (path.endsWith(".java")) {
                units.add(new SimpleJavaFileObject(URI.create("string:///" + path), JavaFileObject.Kind.SOURCE) {
                    @Override
                    public CharSequence getCharContent(boolean ignoreEncodingErrors) {
                        return content;
                    }
                });
            }
        });
        JavacTask task = (JavacTask) compiler.getTask(null, null, diagnostics, List.of("--release", "21"), null, units);
        Set<String> invocations = new HashSet<>();
        Set<String> classes = new HashSet<>();
        Set<String> fields = new HashSet<>();
        for (CompilationUnitTree unit : task.parse()) {
            new TreeScanner<Void, Void>() {
                @Override
                public Void visitMethodInvocation(MethodInvocationTree node, Void unused) {
                    invocations.add(node.getMethodSelect().toString());
                    return super.visitMethodInvocation(node, unused);
                }

                @Override
                public Void visitClass(ClassTree node, Void unused) {
                    classes.add(node.getSimpleName().toString());
                    return super.visitClass(node, unused);
                }

                @Override
                public Void visitVariable(VariableTree node, Void unused) {
                    fields.add(node.getName().toString());
                    return super.visitVariable(node, unused);
                }
            }.scan(unit, null);
        }
        List<String> errors = diagnostics.getDiagnostics().stream()
                .filter(d -> d.getKind() == Diagnostic.Kind.ERROR)
                .map(d -> d.getSource().getName() + ":" + d.getLineNumber() + " " + d.getMessage(null))
                .toList();
        return new JavaAnalysis(errors, invocations, classes, fields);
    }

    private static Object yaml(String content) {
        return new Yaml().load(content);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object value) {
        return (Map<String, Object>) value;
    }

    private static Document xml(String content) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        return factory.newDocumentBuilder().parse(new InputSource(new StringReader(content)));
    }

    private static EmbeddedPostgres postgres;

    /** Un seul PostgreSQL pour toute la classe (le démarrage coûte plusieurs secondes) ; chaque test repart d'un schéma vide. */
    private static synchronized Connection freshDatabase() throws Exception {
        if (postgres == null) {
            postgres = EmbeddedPostgres.start();
            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                try {
                    postgres.close();
                } catch (IOException ignored) {
                    // Arrêt.
                }
            }));
        }
        Connection connection = postgres.getPostgresDatabase().getConnection();
        try (Statement statement = connection.createStatement()) {
            statement.execute("drop schema public cascade; create schema public;");
        }
        return connection;
    }

    /** Exécute le SQL sur le PostgreSQL embarqué et rend les noms des tables créées. */
    private static List<String> runSql(String sql) throws Exception {
        try (Connection connection = freshDatabase(); Statement statement = connection.createStatement()) {
            statement.execute(sql);
            List<String> tables = new ArrayList<>();
            try (ResultSet rs = statement.executeQuery("select table_name from information_schema.tables where table_schema = 'public' order by 1")) {
                while (rs.next()) {
                    tables.add(rs.getString(1));
                }
            }
            return tables;
        }
    }

    // ------------------------------------------------------------------ L'exemple

    @Test
    void theExampleProducesAWholeProject() throws IOException {
        GeneratedProject project = generator.generate(example(), "Marketplace mobile");

        assertThat(project.files().keySet()).contains(
                "README.md", "openapi.yaml", "docker-compose.yml", ".env.example", ".gitignore",
                ".github/workflows/deploy-systalink.yml",
                "backend/pom.xml", "backend/Dockerfile", "backend/src/main/resources/application.yml",
                "backend/src/main/resources/db/migration/V1__schema_initial.sql",
                "backend/src/main/java/com/example/marketplacemobile/Application.java",
                "backend/src/main/java/com/example/marketplacemobile/domain/Produit.java",
                "backend/src/main/java/com/example/marketplacemobile/domain/Commande.java",
                "backend/src/main/java/com/example/marketplacemobile/repository/ProduitRepository.java",
                "backend/src/main/java/com/example/marketplacemobile/repository/CommandeRepository.java",
                "backend/src/main/java/com/example/marketplacemobile/web/ApiMarketplaceController.java",
                "frontend/package.json", "frontend/Dockerfile", "frontend/app/page.tsx", "frontend/app/layout.tsx",
                "frontend/app/accueil/page.tsx", "frontend/app/panier/page.tsx", "frontend/app/commandes/page.tsx",
                "docs/architecture/architecture.md", "docs/architecture/data-model.md", "docs/architecture/canvas.json");
        assertThat(project.fileCount()).isBetween(25, 60);
        assertThat(project.totalBytes()).isBetween(5_000L, 200_000L);
        assertThat(project.slug()).isEqualTo("marketplace-mobile");
        assertThat(project.workflowPaths()).containsExactly(".github/workflows/deploy-systalink.yml");
        assertThat(project.warnings()).isEmpty();
    }

    @Test
    void generatedJavaIsValid() throws IOException {
        JavaAnalysis analysis = analyzeJava(generator.generate(example(), "Marketplace mobile").files());

        assertThat(analysis.errors()).isEmpty();
        assertThat(analysis.classes()).contains("Application", "Produit", "Commande", "ProduitRepository", "CommandeRepository", "ApiMarketplaceController");
    }

    @Test
    void entitiesFollowTheTablesOfTheCanvas() throws IOException {
        Map<String, String> files = generator.generate(example(), "x").files();
        String commande = files.get("backend/src/main/java/com/example/x/domain/Commande.java");

        assertThat(commande)
                .contains("@Table(name = \"commande\")")
                .contains("@Column(name = \"reference\", nullable = false, unique = true)")
                .contains("private BigDecimal total;")
                .contains("@Column(name = \"cree_le\", nullable = false)")
                .contains("private Instant creeLe;")
                .contains("GenerationType.UUID");
        assertThat(files.get("backend/src/main/java/com/example/x/domain/Produit.java")).contains("private Integer stock;");
        assertThat(files.get("backend/src/main/java/com/example/x/domain/Produit.java")).doesNotContain("nullable = false, unique").doesNotContain("@Column(name = \"stock\", nullable");
    }

    @Test
    void aMissingRequiredFieldIsRefusedWith400BeforeReachingTheDatabase() throws IOException {
        Map<String, String> files = generator.generate(example(), "x").files();
        String commande = files.get("backend/src/main/java/com/example/x/domain/Commande.java");
        String produit = files.get("backend/src/main/java/com/example/x/domain/Produit.java");

        // Un texte obligatoire est non vide ; un autre type obligatoire est présent ; un champ facultatif n'a aucune contrainte.
        assertThat(commande)
                .contains("import jakarta.validation.constraints.NotBlank;")
                .contains("import jakarta.validation.constraints.NotNull;")
                .contains("@NotBlank(message = \"est obligatoire\")\n    @Column(name = \"reference\"")
                .contains("@NotNull(message = \"est obligatoire\")\n    @Column(name = \"total\"")
                .contains("@NotNull(message = \"est obligatoire\")\n    @Column(name = \"cree_le\"");
        assertThat(produit)
                .contains("@NotBlank(message = \"est obligatoire\")\n    @Column(name = \"nom\"")
                .doesNotContain("@NotNull(message = \"est obligatoire\")\n    @Column(name = \"stock\"")
                .doesNotContain("@NotBlank(message = \"est obligatoire\")\n    @Column(name = \"stock\"");

        // Le corps des requêtes est validé, et le refus est un 400 qui nomme les champs (409 réservé aux doublons).
        assertThat(files.get("backend/src/main/java/com/example/x/web/ApiMarketplaceController.java"))
                .contains("import jakarta.validation.Valid;")
                .contains("(@Valid @RequestBody Commande body)");
        assertThat(files.get("backend/src/main/java/com/example/x/web/ApiErrorHandler.java"))
                .contains("MethodArgumentNotValidException")
                .contains("HttpStatus.BAD_REQUEST")
                .contains("HttpStatus.CONFLICT");
        assertThat(files.get("backend/pom.xml")).contains("<artifactId>spring-boot-starter-validation</artifactId>");

        // Le contrat écrit ce que le code répond : 400 et 409 déclarés sur la création.
        Map<String, Object> openapi = map(yaml(files.get("openapi.yaml")));
        Map<String, Object> post = map(map(map(openapi.get("paths")).get("/commandes")).get("post"));
        assertThat(map(post.get("responses")).keySet()).containsExactly("201", "400", "409");
        assertThat(files.get("openapi.yaml")).contains("champs:");

        // Un doublon est une erreur du client : pas d'ERROR dans le journal (« OFF » entre guillemets : YAML 1.1 lit off comme faux).
        Map<String, Object> logging = map(map(yaml(files.get("backend/src/main/resources/application.yml"))).get("logging"));
        assertThat(map(logging.get("level")).get("org.hibernate.engine.jdbc.spi.SqlExceptionHelper")).isEqualTo("OFF");
    }

    @Test
    void anEntityWithoutRequiredFieldsHasNoValidationAnnotation() {
        JsonNode canvas = snapshot(
                node("n1", "database", "{\"name\":\"base\",\"entities\":[{\"name\":\"note\",\"fields\":[{\"name\":\"texte\",\"type\":\"string\"}]}]}"),
                "");

        assertThat(generator.generate(canvas, "x").files().get("backend/src/main/java/com/example/x/domain/Note.java"))
                .doesNotContain("jakarta.validation").doesNotContain("@NotNull").doesNotContain("@NotBlank");
    }

    @Test
    void endpointsNamedLikeATableGetACrudAndTheOthersAreStubs() {
        JsonNode canvas = snapshot(
                node("n1", "database", "{\"name\":\"base\",\"entities\":[{\"name\":\"produit\",\"fields\":[{\"name\":\"nom\",\"type\":\"string\"}]}]}")
                        + "," + node("n2", "service", "{\"name\":\"api\",\"endpoints\":["
                                + "{\"method\":\"GET\",\"path\":\"/produits\"},{\"method\":\"POST\",\"path\":\"/produits\"},"
                                + "{\"method\":\"GET\",\"path\":\"/produits/{id}\"},{\"method\":\"PUT\",\"path\":\"/produits/{id}\"},"
                                + "{\"method\":\"PATCH\",\"path\":\"/produits/{ref}\"},{\"method\":\"DELETE\",\"path\":\"/produits/{id}\"},"
                                + "{\"method\":\"POST\",\"path\":\"/produits/{id}\"},{\"method\":\"GET\",\"path\":\"/stats\"},"
                                + "{\"method\":\"GET\",\"path\":\"/lignes/{order-id}/detail\"}]}"),
                "");
        String controller = generator.generate(canvas, "x").files().get("backend/src/main/java/com/example/x/web/ApiController.java");

        assertThat(controller)
                .contains("produitRepository.findAll()")
                .contains("produitRepository.save(body)")
                .contains("produitRepository.findById(id)")
                .contains("produitRepository.existsById(id)")
                .contains("produitRepository.deleteById(id)")
                .contains("@PathVariable(\"ref\") UUID id")
                .contains("notImplemented(\"POST /produits/{id}\")")
                .contains("notImplemented(\"GET /stats\")")
                .contains("@PathVariable(\"order-id\") String orderId")
                .contains("HttpStatus.NOT_IMPLEMENTED");
    }

    @Test
    void duplicateRoutesAreDroppedBecauseSpringWouldRefuseToStart() {
        JsonNode canvas = snapshot(
                node("n1", "service", "{\"name\":\"a\",\"endpoints\":[{\"method\":\"GET\",\"path\":\"/x/{u}\"},{\"method\":\"GET\",\"path\":\"/x/{v}\"}]}")
                        + "," + node("n2", "service", "{\"name\":\"b\",\"endpoints\":[{\"method\":\"GET\",\"path\":\"/x/{w}\"},{\"method\":\"POST\",\"path\":\"/x/{w}\"}]}"),
                "");
        GeneratedProject project = generator.generate(canvas, "x");

        assertThat(project.warnings()).hasSize(2).allMatch(w -> w.contains("existe déjà"));
        assertThat(project.files().get("backend/src/main/java/com/example/x/web/BController.java")).contains("PostMapping").doesNotContain("GetMapping");
    }

    // ------------------------------------------------------------------ Fichiers de configuration

    @Test
    void configurationFilesAreValidYamlAndXml() throws Exception {
        Map<String, String> files = generator.generate(example(), "Marketplace mobile").files();

        Map<String, Object> compose = map(yaml(files.get("docker-compose.yml")));
        assertThat(map(compose.get("services")).keySet()).containsExactlyInAnyOrder("db", "backend", "frontend");
        assertThat(map(map(compose.get("services")).get("backend"))).containsKeys("build", "environment", "depends_on", "mem_limit", "cap_drop");

        Map<String, Object> openapi = map(yaml(files.get("openapi.yaml")));
        assertThat(openapi.get("openapi")).isEqualTo("3.0.3");
        assertThat(map(openapi.get("paths")).keySet()).containsExactly("/produits", "/commandes");
        assertThat(map(map(openapi.get("components")).get("schemas")).keySet()).containsExactly("Produit", "Commande");
        assertThat(map(map(map(map(openapi.get("components")).get("schemas")).get("Commande")).get("properties")).keySet())
                .contains("creeLe").doesNotContain("cree_le");
        assertThat(map(map(map(openapi.get("components")).get("schemas")).get("Commande")).get("required")).isEqualTo(List.of("reference", "total", "creeLe"));

        Map<String, Object> workflow = map(yaml(files.get(".github/workflows/deploy-systalink.yml")));
        assertThat(workflow.get("name")).isEqualTo("Déployer sur Systalink");
        // YAML 1.1 lit « on » comme un booléen ; GitHub (YAML 1.2) comme une clé.
        assertThat(map(workflow.get(Boolean.TRUE))).containsKey("workflow_dispatch");

        assertThat(map(yaml(files.get("backend/src/main/resources/application.yml"))).keySet()).contains("server", "spring", "management");
        assertThat(files.get("frontend/package.json")).satisfies(content -> assertThat(json.readTree(content).path("dependencies").has("next")).isTrue());

        Document pom = xml(files.get("backend/pom.xml"));
        assertThat(pom.getElementsByTagName("artifactId").item(1).getTextContent()).isEqualTo("marketplace-mobile-backend");
        assertThat(files.get("backend/pom.xml")).contains("<version>3.5.16</version>").contains("flyway-database-postgresql");
    }

    @Test
    void theSecretsOfTheWorkflowAreNeverWrittenInTheProject() throws IOException {
        Map<String, String> files = generator.generate(example(), "x").files();

        assertThat(files.get(".github/workflows/deploy-systalink.yml"))
                .contains("${{ secrets.SYSTALINK_SSH_PRIVATE_KEY }}")
                .contains("StrictHostKeyChecking=yes")
                .doesNotContain("StrictHostKeyChecking=no")
                .doesNotContain("ssh-keyscan");
        assertThat(files.values()).noneMatch(content -> content.contains("BEGIN OPENSSH") || content.contains("ghp_"));
    }

    @Test
    void theGeneratedWorkflowUsesCurrentVersionsOfTheActions() throws IOException {
        String workflow = generator.generate(example(), "x").files().get(".github/workflows/deploy-systalink.yml");

        // Les versions « v4 » sont annoncées dépréciées par GitHub (A-16, PR-2). Le projet généré ne doit pas démarrer périmé.
        assertThat(workflow).contains("actions/checkout@v7").doesNotContain("actions/checkout@v4");
    }

    private static final List<String> WORKFLOW_SECRETS =
            List.of("SYSTALINK_SSH_HOST", "SYSTALINK_SSH_USER", "SYSTALINK_SSH_PRIVATE_KEY", "SYSTALINK_SSH_KNOWN_HOSTS");

    @Test
    void theWorkflowNamesTheMissingSecretsInsteadOfFailingInsideSsh() throws Exception {
        Path bash = Stream.of("/bin/bash", "C:/Program Files/Git/bin/bash.exe").map(Path::of).filter(Files::isExecutable).findFirst().orElse(null);
        assumeTrue(bash != null, "bash introuvable");
        Map<String, Object> workflow = map(yaml(generator.generate(example(), "x").files().get(".github/workflows/deploy-systalink.yml")));
        List<?> steps = (List<?>) map(map(workflow.get("jobs")).get("deploy")).get("steps");
        Map<String, Object> first = map(steps.get(0));

        assertThat(first.get("name")).as("la vérification passe avant toute connexion").isEqualTo("Vérifier les secrets");
        assertThat(map(first.get("env")).keySet()).containsExactlyElementsOf(WORKFLOW_SECRETS);
        String script = (String) first.get("run");

        assertThat(runWithSecrets(bash, script, WORKFLOW_SECRETS)).as("tous présents").isEqualTo(new ScriptResult(0, ""));

        ScriptResult none = runWithSecrets(bash, script, List.of());
        assertThat(none.exitCode()).as("aucun secret").isEqualTo(1);
        assertThat(none.output()).contains("Secrets manquants").contains(WORKFLOW_SECRETS);

        ScriptResult oneMissing = runWithSecrets(bash, script, List.of("SYSTALINK_SSH_HOST", "SYSTALINK_SSH_USER", "SYSTALINK_SSH_PRIVATE_KEY"));
        assertThat(oneMissing.exitCode()).isEqualTo(1);
        assertThat(oneMissing.output()).contains("SYSTALINK_SSH_KNOWN_HOSTS")
                .doesNotContain("SYSTALINK_SSH_HOST", "SYSTALINK_SSH_USER", "SYSTALINK_SSH_PRIVATE_KEY")
                .as("la valeur d'un secret n'est jamais écrite").doesNotContain("valeur-secrete");
    }

    private record ScriptResult(int exitCode, String output) { }

    /** Joue le script avec ces secrets à la valeur {@code valeur-secrete}, les autres absents, comme le fait GitHub Actions. */
    private static ScriptResult runWithSecrets(Path bash, String script, List<String> present) throws IOException, InterruptedException {
        // Un fichier plutôt que « -c » : sous Windows, les guillemets d'un argument multiligne ne survivent pas au passage à bash.
        Path file = Files.createTempFile("workflow-step", ".sh");
        try {
            Files.writeString(file, script, StandardCharsets.UTF_8);
            ProcessBuilder builder = new ProcessBuilder(bash.toString(), "-e", file.toString().replace('\\', '/')).redirectErrorStream(true);
            WORKFLOW_SECRETS.forEach(name -> builder.environment().remove(name));
            present.forEach(name -> builder.environment().put(name, "valeur-secrete"));
            Process process = builder.start();
            String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            return new ScriptResult(process.waitFor(), output);
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    void theMigrationRunsOnPostgresAndEnforcesTheConstraints() throws Exception {
        String sql = generator.generate(example(), "x").files().get("backend/src/main/resources/db/migration/V1__schema_initial.sql");

        try (Connection connection = freshDatabase(); Statement statement = connection.createStatement()) {
            statement.execute(sql);
            statement.execute("insert into produit (nom, prix) values ('Stylo', 1.5)");
            statement.execute("insert into commande (reference, total, cree_le) values ('R1', 10, now())");
            assertThatThrownBy(() -> statement.execute("insert into produit (nom) values ('sans prix')")).isInstanceOf(SQLException.class);
            assertThatThrownBy(() -> statement.execute("insert into commande (reference, total, cree_le) values ('R1', 5, now())"))
                    .as("référence unique").isInstanceOf(SQLException.class);
            try (ResultSet rs = statement.executeQuery("select count(*) from produit")) {
                rs.next();
                assertThat(rs.getInt(1)).isEqualTo(1);
            }
        }
    }

    @Test
    void theDiagramsAreWrittenForGitHub() throws IOException {
        Map<String, String> files = generator.generate(example(), "x").files();

        assertThat(files.get("README.md")).contains("```mermaid\nflowchart LR\n").contains("docker compose up --build").contains("SYSTALINK_SSH_HOST");
        assertThat(files.get("docs/architecture/data-model.md")).contains("```mermaid\nerDiagram\n").contains("produit {").contains("uuid id PK").contains("string reference UK");
        assertThat(files.get("docs/architecture/architecture.md")).contains("flowchart LR").contains("[canvas.json](canvas.json)");
        assertThat(json.readTree(files.get("docs/architecture/canvas.json")).path("nodes")).hasSize(7);
    }

    // ------------------------------------------------------------------ Canvas particuliers

    @Test
    void aCanvasWithoutDatabaseHasNoPersistence() {
        JsonNode canvas = snapshot(node("n1", "service", "{\"name\":\"api\",\"endpoints\":[{\"method\":\"GET\",\"path\":\"/ping\"}]}"), "");
        Map<String, String> files = generator.generate(canvas, "Sans base").files();

        assertThat(files.keySet()).noneMatch(path -> path.contains("db/migration") || path.contains("/domain/") || path.contains("/repository/"));
        assertThat(files.get("backend/pom.xml")).doesNotContain("data-jpa").doesNotContain("flyway").doesNotContain("postgresql");
        assertThat(files.get("backend/src/main/resources/application.yml")).doesNotContain("datasource");
        assertThat(map(map(yaml(files.get("docker-compose.yml"))).get("services")).keySet()).containsExactly("backend");
        assertThat(files).doesNotContainKey("docs/architecture/data-model.md");
        assertThat(files.get("README.md")).contains("`GET /ping`");
    }

    @Test
    void anEmptyCanvasStillGivesARunnableSkeleton() throws IOException {
        GeneratedProject project = generator.generate(snapshot("", ""), "");

        assertThat(project.name()).isEqualTo("Projet LONKOO");
        assertThat(project.slug()).isEqualTo("projet-lonkoo");
        assertThat(project.files().get("README.md")).contains("%% Architecture vide");
        assertThat(analyzeJava(project.files()).errors()).isEmpty();
        assertThat(map(yaml(project.files().get("openapi.yaml"))).get("paths")).isEqualTo(Map.of());
    }

    @Test
    void severalWebAppsGetTheirOwnFrontend() {
        JsonNode canvas = snapshot(
                node("n1", "webapp", "{\"name\":\"site\",\"pages\":[\"accueil\",\"accueil\",\"contact\"]}")
                        + "," + node("n2", "webapp", "{\"name\":\"back_office\"}"),
                "");
        GeneratedProject project = generator.generate(canvas, "x");

        assertThat(project.files().keySet()).contains("frontend-site/app/accueil/page.tsx", "frontend-site/app/contact/page.tsx", "frontend-back-office/app/page.tsx");
        assertThat(project.files().keySet().stream().filter(p -> p.startsWith("frontend-site/app/accueil"))).hasSize(1);
        assertThat(map(map(yaml(project.files().get("docker-compose.yml"))).get("services")).keySet()).containsExactlyInAnyOrder("backend", "frontend-site", "frontend-back-office");
        assertThat(project.files().get(".env.example")).contains("FRONTEND_PORT=3000").contains("FRONTEND_2_PORT=3001");
    }

    @Test
    void anInvalidCanvasIsRefused() {
        JsonNode reserved = snapshot(node("n1", "service", "{\"name\":\"class\"}"), "");
        JsonNode duplicate = snapshot(node("n1", "service", "{\"name\":\"a\"}") + "," + node("n1", "service", "{\"name\":\"b\"}"), "");

        assertThatThrownBy(() -> generator.generate(reserved, "x")).isInstanceOf(InvalidCanvasException.class);
        assertThatThrownBy(() -> generator.generate(duplicate, "x")).isInstanceOf(InvalidCanvasException.class);
    }

    @Test
    void theSameCanvasAlwaysGivesTheSameProject() throws IOException {
        GeneratedProject first = generator.generate(example(), "Marketplace mobile");
        GeneratedProject second = generator.generate(example(), "Marketplace mobile");

        assertThat(second.files()).isEqualTo(first.files());
        assertThat(new ArrayList<>(second.files().keySet())).isSorted();
    }

    // ------------------------------------------------------------------ Noms qui se heurtent

    @Test
    void namesThatCollideWithTheJdkOrTheFrameworkAreRenamed() throws Exception {
        String entities = "[" + String.join(",",
                entity("string", "nom"), entity("object", "nom"), entity("application", "nom"), entity("list", "nom"), entity("uuid", "nom"),
                entity("entity", "nom"), entity("produit", "nom"), entity("produit_repository", "nom"), entity("api_controller", "nom")) + "]";
        JsonNode canvas = snapshot(node("n1", "database", "{\"name\":\"base\",\"entities\":" + entities + "}")
                + "," + node("n2", "service", "{\"name\":\"api\"}"), "");
        GeneratedProject project = generator.generate(canvas, "x");
        JavaAnalysis analysis = analyzeJava(project.files());

        assertThat(analysis.errors()).isEmpty();
        assertThat(analysis.classes()).doesNotContain("String", "Object", "List", "UUID", "Entity")
                .contains("StringEntity", "ObjectEntity", "ApplicationEntity", "ListEntity", "Uuid", "EntityEntity", "Produit", "ProduitRepositoryEntity", "ApiControllerEntity");
        // Une seule classe « Application » : celle du démarrage.
        assertThat(project.files().keySet().stream().filter(p -> p.endsWith("/Application.java"))).hasSize(1);
        // Deux classes ne portent jamais le même nom simple (elles seraient importées l'une sur l'autre).
        List<String> simpleNames = project.files().keySet().stream().filter(p -> p.endsWith(".java")).map(p -> p.substring(p.lastIndexOf('/') + 1)).toList();
        assertThat(simpleNames).doesNotHaveDuplicates();
        assertThat(runSql(project.files().get("backend/src/main/resources/db/migration/V1__schema_initial.sql")))
                .contains("string", "object", "application", "list", "uuid", "entity", "produit", "produit_repository", "api_controller");
    }

    private static String entity(String name, String field) {
        return "{\"name\":\"" + name + "\",\"fields\":[{\"name\":\"" + field + "\",\"type\":\"string\"}]}";
    }

    @Test
    void fieldNamesThatAreJavaKeywordsOrTheKeyAreRenamed() throws Exception {
        String fields = "[{\"name\":\"new_\",\"type\":\"string\"},{\"name\":\"id\",\"type\":\"integer\"},{\"name\":\"a_b\",\"type\":\"string\"},"
                + "{\"name\":\"a__b\",\"type\":\"string\"},{\"name\":\"if_\",\"type\":\"boolean\"},{\"name\":\"data\",\"type\":\"json\"},{\"name\":\"quand\",\"type\":\"date\"},"
                + "{\"name\":\"ref\",\"type\":\"uuid\"},{\"name\":\"gros\",\"type\":\"long\"}]";
        JsonNode canvas = snapshot(node("n1", "database", "{\"name\":\"base\",\"entities\":[{\"name\":\"piege\",\"fields\":" + fields + "}]}"), "");
        GeneratedProject project = generator.generate(canvas, "x");
        JavaAnalysis analysis = analyzeJava(project.files());

        assertThat(analysis.errors()).isEmpty();
        assertThat(analysis.fields()).doesNotContain("new", "if").contains("newValue", "ifValue", "idValue", "aB", "aB2");
        assertThat(project.warnings()).anyMatch(w -> w.contains("id_value"));
        String sql = project.files().get("backend/src/main/resources/db/migration/V1__schema_initial.sql");
        assertThat(sql).contains("id_value integer").contains("data jsonb").contains("quand date").contains("gros bigint");
        assertThat(runSql(sql)).containsExactly("piege");
        assertThat(project.files().get("backend/src/main/java/com/example/x/domain/Piege.java")).contains("Map<String, Object> data").contains("@JdbcTypeCode(SqlTypes.JSON)").contains("import java.util.Map;");
    }

    @Test
    void twoDatabasesWithTheSameTableNameDoNotCollide() throws Exception {
        JsonNode canvas = snapshot(node("n1", "database", "{\"name\":\"base_a\",\"entities\":[" + entity("client", "nom") + "]}")
                + "," + node("n2", "database", "{\"name\":\"base_b\",\"entities\":[" + entity("client", "email") + "," + entity("facture", "numero") + "]}"), "");
        GeneratedProject project = generator.generate(canvas, "x");

        assertThat(analyzeJava(project.files()).errors()).isEmpty();
        assertThat(runSql(project.files().get("backend/src/main/resources/db/migration/V1__schema_initial.sql"))).containsExactly("base_a_client", "base_b_client", "facture");
        assertThat(project.files().keySet()).contains("backend/src/main/java/com/example/x/domain/Client.java", "backend/src/main/java/com/example/x/domain/ClientEntity.java");
    }

    // ------------------------------------------------------------------ Textes hostiles

    private static final List<String> HOSTILE = List.of(
            "*/ } static { System.exit(0); } /*",
            "\\u000a System.exit(1); //",
            // « */ » et « /* » écrits en échappements Unicode : javac les décode avant d'analyser, même dans un commentaire.
            "\\u002a\\u002f } static { System.exit(9); } \\u002f\\u002a",
            "\"; DROP TABLE produit; --",
            "<script>alert(1)</script>",
            "ligne 1\n- injecte: oui\nautre: cle",
            "{{7*7}} ${jndi:ldap://x} %s %d",
            "]]> <!-- --> <?xml ?>",
            "`code` [lien](javascript:alert(1)) ![img](x) # titre | colonne",
            "titre ' \" \\ \u2028 \u0085 \u0000 fin",
            "&amp; <b>gras</b> \uD83D\uDE00");

    @Test
    void hostileFreeTextNeverBecomesCodeStructureOrMarkup() throws Exception {
        StringBuilder nodes = new StringBuilder();
        String serviceEndpoints = "[" + String.join(",", HOSTILE.stream()
                .map(h -> "{\"method\":\"GET\",\"path\":\"/p" + Math.abs(h.hashCode()) % 1000 + "\",\"summary\":" + text(h.length() > 80 ? h.substring(0, 80) : h) + "}").toList()) + "]";
        nodes.append(node("n1", "service", "{\"name\":\"api\",\"label\":" + text(HOSTILE.get(0)) + ",\"tech\":" + text(HOSTILE.get(1)) + ",\"endpoints\":" + serviceEndpoints + "}"));
        nodes.append(",").append(node("n2", "database", "{\"name\":\"base\",\"label\":" + text(HOSTILE.get(2)) + ",\"entities\":[" + entity("produit", "nom") + "]}"));
        nodes.append(",").append(node("n3", "webapp", "{\"name\":\"site\",\"label\":" + text(HOSTILE.get(3)) + ",\"tech\":" + text(HOSTILE.get(4)) + "}"));
        nodes.append(",").append(node("n4", "queue", "{\"name\":\"bus\",\"label\":" + text(HOSTILE.get(5)) + "}"));
        nodes.append(",").append(node("n5", "generic", "{\"name\":\"ia\",\"label\":" + text(HOSTILE.get(6)) + ",\"description\":" + text(HOSTILE.get(7)) + "}"));
        nodes.append(",").append(node("n6", "auth", "{\"name\":\"connexion\",\"label\":" + text(HOSTILE.get(8)) + ",\"method\":\"github\"}"));
        JsonNode canvas = snapshot(nodes.toString(), "{\"id\":\"e1\",\"source\":\"n1\",\"target\":\"n2\",\"kind\":\"data\",\"label\":" + text(HOSTILE.get(9)) + "}");

        for (String projectName : List.of(HOSTILE.get(0), HOSTILE.get(1), HOSTILE.get(7), HOSTILE.get(9))) {
            GeneratedProject project = generator.generate(canvas, projectName);
            Map<String, String> files = project.files();

            // Java : lu par javac, sans erreur, et aucun appel injecté.
            JavaAnalysis analysis = analyzeJava(files);
            assertThat(analysis.errors()).isEmpty();
            assertThat(analysis.invocations()).noneMatch(call -> call.contains("exit") || call.contains("Runtime"));

            // YAML : les fichiers se lisent et leur structure est celle attendue (rien n'est injecté).
            Map<String, Object> openapi = map(yaml(files.get("openapi.yaml")));
            assertThat(openapi.keySet()).containsExactly("openapi", "info", "servers", "paths", "components");
            assertThat(map(openapi.get("info")).keySet()).containsExactly("title", "version", "description");
            assertThat(files.get("openapi.yaml")).doesNotContain("\n- injecte").doesNotContain("\nautre:");
            Map<String, Object> compose = map(yaml(files.get("docker-compose.yml")));
            assertThat(compose.keySet()).containsExactly("name", "services", "volumes");
            assertThat(yaml(files.get(".github/workflows/deploy-systalink.yml"))).isInstanceOf(Map.class);

            // XML : le pom est bien formé, le nom du projet y est du texte.
            Document pom = xml(files.get("backend/pom.xml"));
            // Le texte décodé peut contenir « < » (c'est du texte) ; ce qui compte : aucun élément venu du nom.
            assertThat(pom.getElementsByTagName("name").item(0).getChildNodes().getLength()).isEqualTo(1);
            assertThat(pom.getElementsByTagName("b").getLength()).isZero();
            assertThat(pom.getElementsByTagName("script").getLength()).isZero();

            // Markdown, Mermaid, JavaScript : pas de balise ni de lien actif venus du texte libre.
            for (String path : List.of("README.md", "docs/architecture/architecture.md")) {
                String md = files.get(path);
                // Un « < » précédé d'un antislash est du texte en Markdown ; seul un « < » nu ouvrirait une balise.
                // Les blocs de code (Mermaid) ne sont pas du Markdown : leur texte a son échappement et son analyseur.
                String prose = md.replaceAll("(?s)```.*?```", "");
                assertThat(prose).doesNotContainPattern("(?<!\\\\)<(script|b>|/b>|!--|\\?xml)")
                        .doesNotContainPattern("(?<!\\\\)\\]\\(javascript:")
                        .doesNotContainPattern("(?<!\\\\)!\\[");
                assertThat(md.lines().filter(line -> line.startsWith("#")).count()).as(path + " : aucun titre supplémentaire").isLessThanOrEqualTo(12);
            }
            String dump = System.getProperty("lonkoo.generator.dump");
            if (dump != null) {
                Path hostile = Path.of(dump).resolve("hostile");
                Files.createDirectories(hostile);
                Files.writeString(hostile.resolve("README.md"), files.get("README.md"), StandardCharsets.UTF_8);
                Files.writeString(hostile.resolve("data-model.md"), files.get("docs/architecture/data-model.md"), StandardCharsets.UTF_8);
            }
            assertThat(files.get("README.md")).contains("```mermaid\nflowchart LR\n");
            assertThat(files.get("README.md").lines().filter(line -> line.startsWith("  n")).noneMatch(line -> line.contains("<script"))).isTrue();
            assertThat(files.get("frontend/app/layout.tsx")).doesNotContain("</script").contains("title: \"");
            assertThat(files.get("frontend/app/page.tsx")).doesNotContain("</script");

            // SQL : une seule table, et le commentaire ne contient pas d'ordre.
            assertThat(runSql(files.get("backend/src/main/resources/db/migration/V1__schema_initial.sql"))).containsExactly("produit");
        }
    }

    @Test
    void javaCommentsCannotBeEscapedByUnicodeEscapes() {
        String neutralized = Texts.javaComment("fin \\u000a System.exit(1); // */ /* debut", 200);

        assertThat(neutralized).doesNotContain("\\").doesNotContain("*/").doesNotContain("/*").doesNotContain("\n");
    }

    @Test
    void textEscapersProduceTheirDestinationFormat() {
        assertThat(Texts.yaml("a: b\n- c \"d\" \u2028")).isEqualTo("\"a: b\\n- c \\\"d\\\" \\u2028\"");
        assertThat(Texts.markdown("# [x](y) <b> `c` | d", 80)).isEqualTo("\\# \\[x\\]\\(y\\) \\<b\\> \\`c\\` \\| d");
        assertThat(Texts.mermaid("A \"b\" <c> & `d` #e")).isEqualTo("A #quot;b#quot; #lt;c#gt; #amp; #96;d#96; #35;e");
        assertThat(Texts.xml("a < b & c > d", 80)).isEqualTo("a &lt; b &amp; c &gt; d");
        assertThat(Texts.javaString("a\"b\\c\né")).isEqualTo("\"a\\\"b\\\\c\\n\\u00e9\"");
        assertThat(Texts.json("</script>")).isEqualTo("\"<\\/script>\"");
        assertThat(Texts.plain("a\u0000b\n\tc", 80)).isEqualTo("a b c");
    }

    // ------------------------------------------------------------------ Taille

    @Test
    void aCanvasAtTheLimitsOfTheContractIsGeneratedQuickly() throws Exception {
        StringBuilder nodes = new StringBuilder();
        for (int d = 0; d < 5; d++) {
            StringBuilder entities = new StringBuilder();
            for (int e = 0; e < 40; e++) {
                StringBuilder fields = new StringBuilder();
                for (int f = 0; f < 40; f++) {
                    fields.append(f == 0 ? "" : ",").append("{\"name\":\"champ_").append(f).append("\",\"type\":\"string\"}");
                }
                entities.append(e == 0 ? "" : ",").append("{\"name\":\"table_").append(e).append("\",\"fields\":[").append(fields).append("]}");
            }
            nodes.append(d == 0 ? "" : ",").append(node("d" + d, "database", "{\"name\":\"base_" + d + "\",\"entities\":[" + entities + "]}"));
        }
        for (int s = 0; s < 20; s++) {
            StringBuilder endpoints = new StringBuilder();
            for (int e = 0; e < 50; e++) {
                endpoints.append(e == 0 ? "" : ",").append("{\"method\":\"GET\",\"path\":\"/s").append(s).append("/r").append(e).append("\"}");
            }
            nodes.append(",").append(node("s" + s, "service", "{\"name\":\"service_" + s + "\",\"endpoints\":[" + endpoints + "]}"));
        }
        JsonNode canvas = snapshot(nodes.toString(), "");

        long start = System.nanoTime();
        GeneratedProject project = generator.generate(canvas, "Gros projet");
        long millis = (System.nanoTime() - start) / 1_000_000;

        assertThat(millis).isLessThan(5_000);
        assertThat(project.fileCount()).isGreaterThan(400);
        assertThat(project.totalBytes()).isLessThan(8_000_000L);
        assertThat(analyzeJava(project.files()).errors()).isEmpty();
    }

    @Test
    void dumpForInspection() throws IOException {
        String target = System.getProperty("lonkoo.generator.dump");
        assumeTrue(target != null, "propriété lonkoo.generator.dump absente");
        GeneratedProject project = generator.generate(example(), "Marketplace mobile");
        for (Map.Entry<String, String> file : project.files().entrySet()) {
            Path path = Path.of(target).resolve(file.getKey());
            Files.createDirectories(path.getParent());
            Files.writeString(path, file.getValue(), StandardCharsets.UTF_8);
        }
        assertThat(project.files()).isNotEmpty();
    }
}
