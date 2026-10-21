package com.lonkoo.backend.canvas;

import java.util.UUID;

import com.lonkoo.backend.model.Role;

/**
 * Résultat d'un contrôle d'accès sur un canvas : le rôle de l'utilisateur.
 */
public record CanvasAccess(
        UUID canvasId,
        Role role) {

    public boolean canWrite() {
        return role.atLeast(Role.WRITE);
    }

    public boolean canManageMembers() {
        return role.atLeast(Role.MAINTAINER);
    }
}