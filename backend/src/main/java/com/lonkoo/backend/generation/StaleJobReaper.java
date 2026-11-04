package com.lonkoo.backend.generation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Rattrape les travaux dont le fil d'exécution s'est perdu sans écrire son résultat (panne de la base à cet instant,
 * arrêt brutal du fil) : une génération, un envoi ou un lancement de déploiement resté « en cours » au-delà du délai
 * (30 minutes par défaut, alors qu'ils prennent quelques secondes) est marqué échoué. Sans cela, il bloquerait toute
 * nouvelle demande sur ce canvas (409 « déjà en cours ») jusqu'au prochain redémarrage du serveur.
 *
 * <p>Un déploiement dont l'exécution est connue (identifiant de l'exécution GitHub) n'est pas touché : sa lecture le
 * ramène à l'état réel. Seuls ceux qui ne peuvent pas se résoudre seuls sont marqués échoués.</p>
 */
@Component
public class StaleJobReaper {

    private static final Logger log = LoggerFactory.getLogger(StaleJobReaper.class);

    private final GenerationRepository generations;
    private final DeploymentRepository deployments;
    private final int staleMinutes;

    StaleJobReaper(GenerationRepository generations, DeploymentRepository deployments,
            @Value("${lonkoo.jobs.stale-minutes:30}") int staleMinutes) {
        this.generations = generations;
        this.deployments = deployments;
        this.staleMinutes = staleMinutes;
    }

    @Scheduled(fixedDelayString = "PT5M", initialDelayString = "PT5M")
    public void reap() {
        int generationCount = generations.failStaleGenerations(staleMinutes);
        int pushCount = generations.failStalePushes(staleMinutes);
        int deploymentCount = deployments.failStale(staleMinutes);
        if (generationCount + pushCount + deploymentCount > 0) {
            log.warn("Travaux restés en cours depuis plus de {} min, marqués échoués : {} génération(s), {} envoi(s), {} déploiement(s)",
                    staleMinutes, generationCount, pushCount, deploymentCount);
        }
    }
}
