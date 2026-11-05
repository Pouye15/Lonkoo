package com.lonkoo.backend.project;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.lonkoo.backend.model.CurrentUser;
import com.lonkoo.backend.web.ForbiddenException;
import com.lonkoo.backend.web.MessageResponse;

/**
 * Discussion d'un projet : lire (tout membre) et écrire (tout membre).
 */
@RestController
@RequestMapping("/api")
public class DiscussionController {

    private final DiscussionService discussionService;

    public DiscussionController(DiscussionService discussionService) {
        this.discussionService = discussionService;
    }

    @GetMapping("/projects/{projectId}/messages")
    List<MessageResponse> list(
            Authentication authentication,
            @PathVariable UUID projectId,
            @RequestParam(required = false) Long after,
            @RequestParam(required = false) Integer limit) {
        return discussionService.list(currentUser(authentication), projectId, after, limit);
    }

    @PostMapping("/projects/{projectId}/messages")
    ResponseEntity<MessageResponse> post(
            Authentication authentication,
            @PathVariable UUID projectId,
            @RequestBody PostMessageRequest request) {
        MessageResponse created = discussionService.post(currentUser(authentication), projectId, request.body());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    record PostMessageRequest(String body) {
    }

    private CurrentUser currentUser(Authentication authentication) {
        if (authentication != null && authentication.getPrincipal() instanceof CurrentUser user) {
            return user;
        }
        throw new ForbiddenException("Non authentifié");
    }
}
