package com.lonkoo.backend.auth;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.security.SessionSecurityContextRepository;
import com.lonkoo.backend.support.AuditService;
import com.lonkoo.backend.support.GuestRateLimiter;
import com.lonkoo.backend.web.MeResponse;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

/**
 * Session : invité éphémère, profil courant, déconnexion.
 */
@RestController
@RequestMapping("/api")
public class AuthController {

    private final GuestService guestService;
    private final GuestRateLimiter rateLimiter;
    private final AuditService auditService;

    public AuthController(GuestService guestService, GuestRateLimiter rateLimiter, AuditService auditService) {
        this.guestService = guestService;
        this.rateLimiter = rateLimiter;
        this.auditService = auditService;
    }

    @PostMapping("/auth/guest")
    ResponseEntity<MeResponse> guest(HttpServletRequest request) {
        String address = request.getRemoteAddr();
        if (!rateLimiter.allow(address)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).build();
        }

        CurrentUser user = guestService.createGuest();

        // La session serveur porte l'utilisateur (cookie JSESSIONID), relu par
        // SessionSecurityContextRepository à chaque requête. Une session neuve
        // remplace l'éventuelle ancienne.
        SessionSecurityContextRepository.login(request, user);

        auditService.record(user.id(), "login", "user:" + user.id(), null);

        return ResponseEntity.status(HttpStatus.CREATED).body(toMe(user));
    }

    @GetMapping("/me")
    ResponseEntity<MeResponse> me(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof CurrentUser user)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return ResponseEntity.ok(toMe(user));
    }

    @PostMapping("/auth/logout")
    ResponseEntity<Void> logout(HttpServletRequest request, Authentication authentication) {
        if (authentication != null && authentication.getPrincipal() instanceof CurrentUser user) {
            auditService.record(user.id(), "logout", "user:" + user.id(), null);
        }
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        return ResponseEntity.noContent().build();
    }

    private MeResponse toMe(CurrentUser user) {
        return new MeResponse(user.id(), user.login(), user.displayName(), user.avatarUrl(), user.isGuest());
    }
}