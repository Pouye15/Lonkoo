package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.project.DiscussionService;

/** Le nom sous lequel une personne parle dans la discussion d'un projet. */
class DiscussionAuthorNameTest {

    private static CurrentUser user(String login, String displayName, boolean guest) {
        return new CurrentUser(UUID.randomUUID(), login, displayName, null, guest, guest ? Instant.now() : null);
    }

    @Test
    void guestsAreToldApartByTheStartOfTheirIdentifier() {
        assertThat(DiscussionService.authorName(user("invite-40944a00", "Invité", true))).isEqualTo("Invité 4094");
        assertThat(DiscussionService.authorName(user("invite-9517d4f3", "Invité", true))).isEqualTo("Invité 9517");
    }

    @Test
    void anAccountKeepsItsNameAsIs() {
        assertThat(DiscussionService.authorName(user("aminata", "Aminata Sow", false))).isEqualTo("Aminata Sow");
        assertThat(DiscussionService.authorName(user("aminata", "  Aminata Sow  ", false))).as("espaces de bord retirés").isEqualTo("Aminata Sow");
    }

    @Test
    void withoutADisplayNameTheLoginIsUsed() {
        assertThat(DiscussionService.authorName(user("aminata", null, false))).isEqualTo("aminata");
        assertThat(DiscussionService.authorName(user("aminata", "   ", false))).isEqualTo("aminata");
    }

    @Test
    void aGuestWithAnUnexpectedLoginIsNotMangled() {
        assertThat(DiscussionService.authorName(user("autre", "Invité", true))).isEqualTo("Invité");
        assertThat(DiscussionService.authorName(user("invite-ab", "Invité", true))).as("identifiant trop court").isEqualTo("Invité");
    }

    @Test
    void aVeryLongNameIsCutToWhatTheColumnAccepts() {
        assertThat(DiscussionService.authorName(user("x", "n".repeat(300), false))).hasSize(120);
    }
}
