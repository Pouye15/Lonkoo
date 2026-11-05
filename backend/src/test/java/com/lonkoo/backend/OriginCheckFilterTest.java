package com.lonkoo.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import com.lonkoo.backend.security.OriginCheckFilter;
import com.lonkoo.backend.security.SecurityConfig;

/**
 * Contrôle de l'origine des écritures venues d'un navigateur : l'adresse publique passe, tout autre site est refusé,
 * et en développement (derrière un relais qui réécrit l'en-tête, comme celui d'un Codespace GitHub) on peut en autoriser
 * d'autres, explicitement.
 */
class OriginCheckFilterTest {

    private static final String PUBLIC_URL = "https://lonkoo.example.org";

    /** Statut de la réponse, ou 200 si la requête a été transmise à la suite de la chaîne. */
    private static int statusOf(OriginCheckFilter filter, String method, String origin, String referer) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(method, "/api/projects");
        if (origin != null) {
            request.addHeader("Origin", origin);
        }
        if (referer != null) {
            request.addHeader("Referer", referer);
        }
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();
        filter.doFilter(request, response, chain);
        return chain.getRequest() == null ? response.getStatus() : 200;
    }

    @Test
    void thePublicAddressPassesAndAnyOtherSiteIsRefused() throws Exception {
        OriginCheckFilter filter = new OriginCheckFilter(PUBLIC_URL);

        assertThat(statusOf(filter, "POST", PUBLIC_URL, null)).isEqualTo(200);
        assertThat(statusOf(filter, "POST", "https://autre-site.example", null)).isEqualTo(403);
        assertThat(statusOf(filter, "POST", "http://lonkoo.example.org", null)).as("le schéma compte").isEqualTo(403);
        assertThat(statusOf(filter, "POST", "https://lonkoo.example.org:8443", null)).as("le port compte").isEqualTo(403);
        assertThat(statusOf(filter, "DELETE", "https://autre-site.example", null)).isEqualTo(403);
    }

    @Test
    void readsAndRequestsWithoutOriginAreNotChecked() throws Exception {
        OriginCheckFilter filter = new OriginCheckFilter(PUBLIC_URL);

        assertThat(statusOf(filter, "GET", "https://autre-site.example", null)).isEqualTo(200);
        assertThat(statusOf(filter, "POST", null, null)).as("curl, tests : pas d'Origin").isEqualTo(200);
    }

    @Test
    void theRefererIsUsedWhenThereIsNoOrigin() throws Exception {
        OriginCheckFilter filter = new OriginCheckFilter(PUBLIC_URL);

        assertThat(statusOf(filter, "POST", null, PUBLIC_URL + "/dashboard")).isEqualTo(200);
        assertThat(statusOf(filter, "POST", null, "https://autre-site.example/page")).isEqualTo(403);
    }

    @Test
    void anExtraOriginIsAcceptedOnlyWhenItIsListedAndTheOthersStayRefused() throws Exception {
        OriginCheckFilter withoutExtra = new OriginCheckFilter(PUBLIC_URL);
        OriginCheckFilter withExtra = new OriginCheckFilter(PUBLIC_URL, List.of("https://localhost:3000"));

        assertThat(statusOf(withoutExtra, "POST", "https://localhost:3000", null)).as("sans réglage : refusée").isEqualTo(403);
        assertThat(statusOf(withExtra, "POST", "https://localhost:3000", null)).isEqualTo(200);
        assertThat(statusOf(withExtra, "POST", PUBLIC_URL, null)).as("l'adresse publique passe toujours").isEqualTo(200);
        assertThat(statusOf(withExtra, "POST", "https://localhost:3001", null)).as("un autre port reste refusé").isEqualTo(403);
        assertThat(statusOf(withExtra, "POST", "http://localhost:3000", null)).as("un autre schéma reste refusé").isEqualTo(403);
        assertThat(statusOf(withExtra, "POST", "https://autre-site.example", null)).isEqualTo(403);
    }

    @Test
    void blankExtraOriginsAreIgnoredAndMalformedOnesStopTheStartup() {
        assertThat(new OriginCheckFilter(PUBLIC_URL, List.of("", "  "))).isNotNull();

        assertThatThrownBy(() -> new OriginCheckFilter(PUBLIC_URL, List.of("localhost:3000")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("localhost:3000");
        assertThatThrownBy(() -> new OriginCheckFilter(PUBLIC_URL, List.of("pas une adresse")))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void extraOriginsAreRefusedInProductionButNotInDevelopment() {
        SecurityConfig.refuseExtraOriginsInProduction(List.of("https://localhost:3000"), false);
        SecurityConfig.refuseExtraOriginsInProduction(List.of(), true);
        SecurityConfig.refuseExtraOriginsInProduction(List.of("", " "), true);

        assertThatThrownBy(() -> SecurityConfig.refuseExtraOriginsInProduction(List.of("https://localhost:3000"), true))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("EXTRA_ALLOWED_ORIGINS");
    }
}
