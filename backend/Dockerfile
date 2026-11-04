# Étape 1 : construction avec Maven
FROM eclipse-temurin:21-jdk AS build
WORKDIR /workspace
COPY pom.xml .
COPY .mvn .mvn
COPY mvnw .
RUN chmod +x mvnw && ./mvnw -B -ntp dependency:go-offline
COPY src src
RUN ./mvnw -B -ntp -DskipTests package

# Étape 2 : exécution avec un JRE léger, utilisateur non root
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system --uid 10001 --create-home spring
COPY --from=build /workspace/target/*.jar app.jar
USER spring:spring
EXPOSE 8080
# La JVM se dimensionne sur la mémoire du conteneur (75 % pour le tas).
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]