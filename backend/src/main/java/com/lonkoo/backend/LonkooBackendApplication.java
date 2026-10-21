package com.lonkoo.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class LonkooBackendApplication {

	public static void main(String[] args) {
		SpringApplication.run(LonkooBackendApplication.class, args);
	}

}
