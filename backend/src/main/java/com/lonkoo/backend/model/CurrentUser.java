package com.lonkoo.backend.model;

import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

/**
 * Utilisateur connecté, conservé dans la session serveur et exposé comme
 * principal Spring Security.
 *
 * <p><strong>Ne pas renommer ni déplacer cette classe</strong> sans migration : les sessions sont en base
 * (Spring Session JDBC) et contiennent cet objet sérialisé par Java, nom de classe compris. Ajouter ou retirer un
 * champ est sans danger (une valeur absente prend sa valeur par défaut) ; un changement de nom ou de paquet rendrait
 * illisibles les sessions en cours, donc déconnecterait tout le monde au déploiement. Le test
 * {@code SessionCompatibilityTest} le garde.</p>
 */
public record CurrentUser(
        UUID id,
        String login,
        String displayName,
        String avatarUrl,
        boolean isGuest,
        Instant expiresAt) implements Serializable {
}