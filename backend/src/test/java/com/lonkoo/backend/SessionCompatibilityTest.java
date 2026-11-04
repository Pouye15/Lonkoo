package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.lonkoo.backend.model.CurrentUser;

/**
 * Les sessions en base contiennent un {@link CurrentUser} sérialisé par Java. Ce test garde ce qui doit rester vrai pour
 * qu'un déploiement ne rende pas les sessions en cours illisibles (donc ne déconnecte pas tout le monde).
 */
class SessionCompatibilityTest {

    @Test
    void theClassStoredInSessionsKeepsItsNameAndItsPackage() {
        assertThat(CurrentUser.class.getName()).isEqualTo("com.lonkoo.backend.model.CurrentUser");
    }

    @Test
    void aSessionObjectSurvivesASerializationRoundTrip() throws Exception {
        CurrentUser user = new CurrentUser(UUID.randomUUID(), "octocat", "Octo Cat", "https://avatars.example/o.png", false, Instant.parse("2030-01-01T00:00:00Z"));

        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ObjectOutputStream out = new ObjectOutputStream(bytes)) {
            out.writeObject(user);
        }
        try (ObjectInputStream in = new ObjectInputStream(new ByteArrayInputStream(bytes.toByteArray()))) {
            assertThat(in.readObject()).isEqualTo(user);
        }
    }
}
