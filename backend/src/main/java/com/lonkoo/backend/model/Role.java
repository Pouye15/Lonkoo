package com.lonkoo.backend.model;

/**
 * Rôles d'un membre sur un projet. Ordre du plus élevé (OWNER) au plus faible
 * (READ) : la comparaison par ordinal donne la hiérarchie.
 */
public enum Role {
    OWNER,
    MAINTAINER,
    WRITE,
    TRIAGE,
    READ;

    /**
     * Vrai si ce rôle est au moins aussi élevé que {@code required}.
     * Exemple : WRITE.atLeast(WRITE) == true, READ.atLeast(WRITE) == false.
     */
    public boolean atLeast(Role required) {
        return ordinal() <= required.ordinal();
    }

    /**
     * Vrai si ce rôle est strictement plus élevé que {@code other}.
     * Exemple : MAINTAINER.isAbove(WRITE) == true, MAINTAINER.isAbove(MAINTAINER) == false.
     */
    public boolean isAbove(Role other) {
        return ordinal() < other.ordinal();
    }
}