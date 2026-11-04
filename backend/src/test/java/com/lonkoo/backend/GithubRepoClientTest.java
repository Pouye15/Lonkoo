package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.lonkoo.backend.github.GithubPushException;
import com.lonkoo.backend.github.GithubPushException.Kind;
import com.lonkoo.backend.github.GithubRepoClient;

/** Le client de l'API GitHub seul (sans Spring ni base) : lots d'arbres, autorisations, réponses inattendues. */
class GithubRepoClientTest {

    private static final FakeGithubApiServer GITHUB = FakeGithubApiServer.start();

    private final GithubRepoClient client = new GithubRepoClient(GITHUB.url(), Duration.ofSeconds(5), Duration.ofMillis(5));

    @AfterAll
    static void stop() {
        GITHUB.server.stop(0);
    }

    @BeforeEach
    void reset() {
        GITHUB.reset();
    }

    @Test
    void theScopesOfTheTokenAreRead() {
        GITHUB.scopes = " public_repo ,read:user,  workflow ";

        GithubRepoClient.Account account = client.account(GITHUB.token);

        assertThat(account.login()).isEqualTo("octocat");
        assertThat(account.scopesKnown()).isTrue();
        assertThat(account.scopes()).containsExactlyInAnyOrder("public_repo", "read:user", "workflow");
        assertThat(account.has("workflow")).isTrue();
        assertThat(account.has("repo")).isFalse();
    }

    @Test
    void aTokenWithoutAnnouncedScopesIsSaidToBeUnknown() {
        GITHUB.scopes = null;

        GithubRepoClient.Account account = client.account(GITHUB.token);

        assertThat(account.scopesKnown()).isFalse();
        assertThat(account.scopes()).isEmpty();
    }

    @Test
    void manyFilesAreSentInBatchesOfAHundredAndAllArrive() {
        GithubRepoClient.Repo repo = client.createRepository(GITHUB.token, "gros", "Gros projet", false);
        Map<String, String> files = new LinkedHashMap<>();
        for (int i = 0; i < 250; i++) {
            files.put("src/f" + i + ".txt", "contenu accentué n°" + i);
        }

        String sha = client.push(GITHUB.token, repo, files, "Message");

        assertThat(GITHUB.callsTo("POST", "/git/trees")).extracting(c -> c.body().get("tree").size()).containsExactly(100, 100, 50);
        FakeGithubApiServer.Repo stored = GITHUB.repos.get("octocat/gros");
        assertThat(stored.head).isEqualTo(sha);
        assertThat(stored.files()).containsAllEntriesOf(files).containsKey("README.md").hasSize(251);
        assertThat(GITHUB.callsTo("POST", "/git/commits").get(0).body().get("message").asText()).isEqualTo("Message");
    }

    @Test
    void aBatchNeverExceedsTheByteLimit() {
        GithubRepoClient.Repo repo = client.createRepository(GITHUB.token, "lourd", "Lourd", false);
        Map<String, String> files = new LinkedHashMap<>();
        String big = "x".repeat(1_500_000);
        for (int i = 0; i < 5; i++) {
            files.put("big" + i + ".txt", big);
        }

        client.push(GITHUB.token, repo, files, "Message");

        assertThat(GITHUB.callsTo("POST", "/git/trees")).extracting(c -> c.body().get("tree").size()).containsExactly(2, 2, 1);
    }

    @Test
    void errorsAreTranslatedAndNeverCarryTheTokenOrTheRawBody() {
        GITHUB.failAlways.put("/user/repos", 500);
        GITHUB.failBodies.put("/user/repos", "{\"message\":\"secret interne " + GITHUB.token + "\"}");

        assertThatThrownBy(() -> client.createRepository(GITHUB.token, "x", "x", false))
                .isInstanceOfSatisfying(GithubPushException.class, e -> {
                    assertThat(e.kind()).isEqualTo(Kind.UNAVAILABLE);
                    assertThat(e.getMessage()).contains("incident").doesNotContain(GITHUB.token).doesNotContain("secret");
                });
    }

    @Test
    void aWrongTokenIsRejected() {
        assertThatThrownBy(() -> client.account("gho_autre"))
                .isInstanceOfSatisfying(GithubPushException.class, e -> assertThat(e.kind()).isEqualTo(Kind.TOKEN_REJECTED));
    }

    @Test
    void secondaryRateLimitIsRecognisedFromTheMessageToo() {
        GITHUB.failAlways.put("/user", 403);
        GITHUB.failBodies.put("/user", "{\"message\":\"You have exceeded a secondary rate limit.\"}");

        assertThatThrownBy(() -> client.account(GITHUB.token))
                .isInstanceOfSatisfying(GithubPushException.class, e -> assertThat(e.kind()).isEqualTo(Kind.RATE_LIMITED));
    }

    @Test
    void aRepositoryDescribedWithAnUnsafeNameIsRefused() {
        GITHUB.failAlways.put("/user/repos", 201);
        GITHUB.failBodies.put("/user/repos", "{\"full_name\":\"octocat/../../admin\",\"html_url\":\"https://github.com/x\",\"default_branch\":\"main\"}");

        assertThatThrownBy(() -> client.createRepository(GITHUB.token, "x", "x", false))
                .isInstanceOfSatisfying(GithubPushException.class, e -> assertThat(e.kind()).isEqualTo(Kind.OTHER));
    }

    @Test
    void anUnsafeBranchOrAddressFromGithubIsRefused() {
        GITHUB.failAlways.put("/user/repos", 201);
        GITHUB.failBodies.put("/user/repos", "{\"full_name\":\"octocat/x\",\"html_url\":\"https://github.com/octocat/x\",\"default_branch\":\"a b?c\"}");
        assertThatThrownBy(() -> client.createRepository(GITHUB.token, "x", "x", false))
                .isInstanceOfSatisfying(GithubPushException.class, e -> assertThat(e.kind()).isEqualTo(Kind.OTHER));

        GITHUB.failBodies.put("/user/repos", "{\"full_name\":\"octocat/x\",\"html_url\":\"javascript:alert(1)\",\"default_branch\":\"main\"}");
        assertThatThrownBy(() -> client.createRepository(GITHUB.token, "x", "x", false))
                .isInstanceOfSatisfying(GithubPushException.class, e -> assertThat(e.kind()).isEqualTo(Kind.OTHER));
    }

    @Test
    void theBranchNeverAppearingEndsInAClearFailure() {
        GITHUB.refMissesAfterCreate = 100;
        GithubRepoClient.Repo repo = client.createRepository(GITHUB.token, "tardif", "Tardif", false);

        assertThatThrownBy(() -> client.push(GITHUB.token, repo, Map.of("a.txt", "a"), "m"))
                .isInstanceOfSatisfying(GithubPushException.class, e -> {
                    assertThat(e.kind()).isEqualTo(Kind.UNAVAILABLE);
                    assertThat(e.getMessage()).contains("pas encore disponible");
                });
        assertThat(GITHUB.callsTo("GET", "/git/ref/heads/main")).hasSize(6);
    }
}
