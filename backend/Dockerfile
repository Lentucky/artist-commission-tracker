# build stage: compile the jar inside Docker so nobody needs Maven installed
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
# the cache mount keeps downloaded dependencies between builds
RUN --mount=type=cache,target=/root/.m2 mvn -q -DskipTests package

# run stage: JRE only, non-root user
FROM eclipse-temurin:17-jre
WORKDIR /app
RUN useradd --system --no-create-home app
COPY --from=build /app/target/*.jar app.jar
USER app
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70", "-XX:+UseSerialGC", "-XX:TieredStopAtLevel=1", "-jar", "app.jar"]