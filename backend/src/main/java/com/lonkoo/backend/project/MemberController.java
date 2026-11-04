package com.lonkoo.backend.project;

import java.util.List;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.web.ForbiddenException;
import com.lonkoo.backend.web.MemberResponse;

/**
 * Membres d'un projet : liste (tout membre), retrait ou départ.
 */
@RestController
@RequestMapping("/api")
public class MemberController {

    private final MemberService memberService;

    public MemberController(MemberService memberService) {
        this.memberService = memberService;
    }

    @GetMapping("/projects/{projectId}/members")
    List<MemberResponse> list(Authentication authentication, @PathVariable UUID projectId) {
        return memberService.list(currentUser(authentication), projectId);
    }

    @DeleteMapping("/projects/{projectId}/members/{userId}")
    ResponseEntity<Void> remove(Authentication authentication, @PathVariable UUID projectId, @PathVariable UUID userId) {
        memberService.remove(currentUser(authentication), projectId, userId);
        return ResponseEntity.noContent().build();
    }

    private CurrentUser currentUser(Authentication authentication) {
        if (authentication != null && authentication.getPrincipal() instanceof CurrentUser user) {
            return user;
        }
        throw new ForbiddenException("Non authentifié");
    }
}
