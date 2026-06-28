# ---------- Build Stage ----------
    FROM maven:3.9.9-eclipse-temurin-17 AS build

    WORKDIR /app
    
    COPY pom.xml .
    COPY src ./src
    
    RUN mvn clean package -Pdev -DskipTests
    
    # ---------- Runtime Stage ----------
    FROM eclipse-temurin:17-jre
    
    WORKDIR /app
    
    COPY --from=build /app/target/*.jar app.jar
    
    EXPOSE 8080
    
    # Cap the JVM heap so the embedded MongoDB process also fits inside a small
    # (512 MB) free-tier container. The app reads $PORT from the platform.
    ENTRYPOINT ["sh","-c","java -XX:MaxRAMPercentage=55 -jar app.jar"]