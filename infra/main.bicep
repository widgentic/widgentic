// Widgentic MCP server on Azure Container Apps.
//
// Implementation choices:
// - Consumption workload profile with scale-to-zero (minReplicas 0): the
//   server is stateless Streamable HTTP, so replicas are interchangeable
//   and idle cost is ~zero; cold starts of a few seconds are acceptable
//   for MCP clients.
// - Container Registry with anonymous pull DISABLED and admin user
//   DISABLED; the app pulls via a USER-ASSIGNED managed identity that is
//   created and granted AcrPull BEFORE the app exists — a system-assigned
//   identity cannot receive the role until after app creation, which races
//   the first image pull (observed live: ACR token exchange 401).
// - The API key is a Container Apps secret injected as an env var; it is
//   passed as a secure parameter and never appears in template outputs.
// - External HTTPS ingress on 3001, matching the container's listening
//   port (PORT env is set to the same value to keep them in lockstep).

@description('Deployment location; defaults to the resource group location.')
param location string = resourceGroup().location

@description('Base name used for resource naming.')
param baseName string = 'widgentic'

@description('API key required by the /mcp endpoint (x-api-key header).')
@secure()
param apiKey string

@description('Container image to run; the ACR build step supplies this.')
param image string = 'mcr.microsoft.com/k8se/quickstart:latest'

var registryName = '${baseName}acr${uniqueString(resourceGroup().id)}'
var appPort = 3001

resource logs 'Microsoft.OperationalInsights/workspaces@2025-02-01' = {
  name: '${baseName}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2025-04-01' = {
  name: registryName
  location: location
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
    anonymousPullEnabled: false
  }
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: '${baseName}-mcp-identity'
  location: location
}

// AcrPull granted before the app exists, so the first pull succeeds.
resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, identity.id, 'acrpull')
  scope: registry
  properties: {
    principalId: identity.properties.principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '7f951dda-4ed3-4680-a7ca-43fe172d538d' // AcrPull
    )
    principalType: 'ServicePrincipal'
  }
}

resource environment 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: '${baseName}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

resource app 'Microsoft.App/containerApps@2025-01-01' = {
  name: '${baseName}-mcp'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  dependsOn: [acrPull]
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      ingress: {
        external: true
        targetPort: appPort
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        {
          server: registry.properties.loginServer
          identity: identity.id
        }
      ]
      secrets: [
        { name: 'widgentic-api-key', value: apiKey }
      ]
    }
    template: {
      containers: [
        {
          name: 'widgentic-mcp'
          image: image
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            { name: 'PORT', value: string(appPort) }
            { name: 'WIDGENTIC_API_KEY', secretRef: 'widgentic-api-key' }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/healthz', port: appPort }
              initialDelaySeconds: 5
              periodSeconds: 30
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 2
      }
    }
  }
}

output appUrl string = 'https://${app.properties.configuration.ingress.fqdn}'
output registryLoginServer string = registry.properties.loginServer
output appName string = app.name
