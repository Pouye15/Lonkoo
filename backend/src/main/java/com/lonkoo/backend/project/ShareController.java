package com.lonkoo.backend.project;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lonkoo.backend.auth.GuestService;
import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.security.SessionSecurityContextRepository;
import com.lonkoo.backend.support.GuestRateLimiter;
import com.lonkoo.backend.web.ForbiddenException;
import com.lonkoo.backend.web.JoinResponse;
import com.lonkoo.backend.web.ShareLinkRequest;
import com.lonkoo.backend.web.ShareLinkResponse;
import com.lonkoo.backend.web.ShareLinkSummary;
import com.lonkoo.backend.web.TooManyRequestsException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

/**
 * Liens de partage (WP5) : création par un MAINTAINER+, jonction publique.
 */
@RestController
@RequestMapping("/api")
public class ShareController {

    private final ShareLinkService shareLinkService;
    private final GuestService guestService;
    private final GuestRateLimiter rateLimiter;

    public ShareController(ShareLinkService shareLinkService, GuestService guestService, GuestRateLimiter rateLimiter) {
        this.shareLinkService = shareLinkService;
        this.guestService = guestService;
        this.rateLimiter = rateLimiter;
    }

    @PostMapping("/canvases/{canvasId}/share-links")
    ResponseEntity<ShareLinkResponse> create(Authentication authentication, @PathVariable UUID canvasId,
            @Valid @RequestBody ShareLinkRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(
                shareLinkService.createLink(currentUser(authentication), canvasId, request.role(), request.ttlHours()));
    }

    @GetMapping("/canvases/{canvasId}/share-links")
    List<ShareLinkSummary> list(@PathVariable UUID canvasId) {
        return shareLinkService.listLinks(canvasId);
    }

    @DeleteMapping("/canvases/{canvasId}/share-links/{linkId}")
    ResponseEntity<Void> revoke(Authentication authentication, @PathVariable UUID canvasId, @PathVariable UUID linkId) {
        shareLinkService.revokeLink(currentUser(authentication), canvasId, linkId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/join/{token}")
    ResponseEntity<JoinResponse> join(HttpServletRequest request, @PathVariable String token, Authentication authentication) {
        CurrentUser connected = authentication != null && authentication.getPrincipal() instanceof CurrentUser current
                ? current
                : null;

        // Un visiteur non connecté devient un invité éphémère, mais seulement une
        // fois le lien reconnu : un jeton inventé ne crée rien et ne compte pas
        // dans la limite par adresse.
        var result = shareLinkService.join(token, () -> connected != null ? connected : newGuest(request));

        if (connected == null) {
            SessionSecurityContextRepository.login(request, result.user());
        }

        return ResponseEntity.ok(new JoinResponse(result.projectId(), result.canvasId(), result.role()));
    }

    private CurrentUser newGuest(HttpServletRequest request) {
        if (!rateLimiter.allow(request.getRemoteAddr())) {
            throw new TooManyRequestsException("Trop d'invités créés depuis cette adresse");
        }
        return guestService.createGuestUser();
    }

    private CurrentUser currentUser(Authentication authentication) {
        if (authentication != null && authentication.getPrincipal() instanceof CurrentUser user) {
            return user;
        }
        throw new ForbiddenException("Non authentifié");
    }
}
