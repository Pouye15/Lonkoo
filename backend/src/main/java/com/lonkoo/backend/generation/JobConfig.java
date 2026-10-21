package com.lonkoo.backend.generation;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Exécuteur des travaux longs (génération, envoi sur GitHub, suivi d'un déploiement). Il est borné : deux travaux
 * à la fois et vingt en attente par défaut, au-delà une demande reçoit « serveur occupé » (503) plutôt que de
 * faire grossir la mémoire. À l'arrêt du serveur, les travaux en cours se terminent (le délai d'arrêt propre de
 * Spring s'applique).
 */
@Configuration
class JobConfig {

    @Bean(destroyMethod = "shutdown")
    ExecutorService jobExecutor(
            @Value("${lonkoo.jobs.threads:2}") int threads,
            @Value("${lonkoo.jobs.queue:20}") int queue) {
        AtomicInteger counter = new AtomicInteger();
        ThreadFactory factory = runnable -> {
            Thread thread = new Thread(runnable, "lonkoo-job-" + counter.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        };
        return new ThreadPoolExecutor(threads, threads, 0L, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(queue), factory,
                new ThreadPoolExecutor.AbortPolicy());
    }
}
