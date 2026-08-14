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

@description('Image for the web app; defaults to the same build (different entry).')
param webImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('Point the MCP server at Cosmos (per-principal catalogs). Flip only after the bootstrap key is seeded, so cutover is deliberate.')
param mcpCosmosEnabled bool = false

@description('Entra External ID issuer URL for the web app; empty until the tenant exists.')
param authIssuer string = ''

@description('App registration client id for the web app.')
param authClientId string = ''

@description('Session-cookie HMAC secret for the web app.')
@secure()
param sessionSecret string = ''

@description('Entra app registration client secret. Empty = public client + PKCE (no secret anywhere); set = confidential client (the token exchange also proves server identity, at the cost of a secret with an expiry to rotate).')
@secure()
param authClientSecret string = ''

@description('GitHub OAuth app client id (direct GitHub sign-in; D4 revised).')
param githubClientId string = ''

@description('GitHub OAuth app client secret.')
@secure()
param githubClientSecret string = ''

@description('Custom domains bound to the MCP app, with their managed-cert resource ids. Empty on first deploy (certs need DNS + a live app); afterwards ALWAYS pass the live bindings — the template owns ingress, and omitting them unbinds the domain (observed live at v11).')
param mcpCustomDomains array = []

@description('Custom domains bound to the web app, same contract as mcpCustomDomains.')
param webCustomDomains array = []

var registryName = '${baseName}acr${uniqueString(resourceGroup().id)}'
var appPort = 3001
var webPort = 3002

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

// Web app identity: separate from the MCP identity on purpose — the two
// hold DIFFERENT Cosmos roles (write vs read-only), which is the second
// half of the "MCP cannot write" guarantee alongside the port types.
resource webIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: '${baseName}-web-identity'
  location: location
}

resource webAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, webIdentity.id, 'acrpull')
  scope: registry
  properties: {
    principalId: webIdentity.properties.principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '7f951dda-4ed3-4680-a7ca-43fe172d538d' // AcrPull
    )
    principalType: 'ServicePrincipal'
  }
}

// Cosmos DB serverless (design D2): the documents are JSON keyed by one
// partition; SQL serverless auto-pause would put a 30–60s cold start on
// the MCP read path, and Table Storage's 64KB property cap collides with
// maxEntryBytes. Serverless pay-per-RU is cents at this volume, and local
// auth (account keys) is disabled — data-plane access is RBAC only.
resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' = {
  name: '${baseName}-cosmos-${uniqueString(resourceGroup().id)}'
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    capabilities: [
      { name: 'EnableServerless' }
    ]
    locations: [
      { locationName: location, failoverPriority: 0, isZoneRedundant: false }
    ]
    disableLocalAuth: true // no account keys, ever — identity only (D6)
    minimalTlsVersion: 'Tls12'
    publicNetworkAccess: 'Enabled'
  }
}

resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-11-15' = {
  parent: cosmos
  name: 'widgentic'
  properties: {
    resource: { id: 'widgentic' }
  }
}

// `data`: one partition per principal; profile/widget:<kind>/theme:<name>
// docs, so a user's whole catalog is a single-partition query (D3).
resource dataContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  parent: cosmosDb
  name: 'data'
  properties: {
    resource: {
      id: 'data'
      partitionKey: { paths: ['/principalId'], kind: 'Hash' }
    }
  }
}

// `keys`: partition key = digest, so resolvePrincipal is a 1-RU point
// read — the hottest path on the MCP side stays O(1) (D3).
resource keysContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  parent: cosmosDb
  name: 'keys'
  properties: {
    resource: {
      id: 'keys'
      partitionKey: { paths: ['/digest'], kind: 'Hash' }
    }
  }
}

// Cosmos data-plane RBAC (D6): the app writes, the MCP server READS ONLY —
// enforced by role assignment, not convention. A leaked MCP container
// cannot write to anyone's catalog.
var cosmosDataReader = '${cosmos.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000001'
var cosmosDataContributor = '${cosmos.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'

resource mcpCosmosRead 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-11-15' = {
  parent: cosmos
  name: guid(cosmos.id, identity.id, 'data-reader')
  properties: {
    principalId: identity.properties.principalId
    roleDefinitionId: cosmosDataReader
    scope: cosmos.id
  }
}

resource webCosmosWrite 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-11-15' = {
  parent: cosmos
  name: guid(cosmos.id, webIdentity.id, 'data-contributor')
  properties: {
    principalId: webIdentity.properties.principalId
    roleDefinitionId: cosmosDataContributor
    scope: cosmos.id
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
        customDomains: mcpCustomDomains
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
          env: concat(
            [
              { name: 'PORT', value: string(appPort) }
              { name: 'WIDGENTIC_API_KEY', secretRef: 'widgentic-api-key' }
              // Stateless HTTP tools/call cannot renegotiate capabilities;
              // production hosts are Apps-capable (set via CLI pre-v11).
              { name: 'WIDGENTIC_ASSUME_UI', value: '1' }
            ],
            mcpCosmosEnabled
              ? [
                  { name: 'WIDGENTIC_COSMOS_ENDPOINT', value: cosmos.properties.documentEndpoint }
                  { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
                ]
              : []
          )
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

// The widgentic.dev app: same environment, own identity, scale-to-zero —
// marginal cost ~0 under the grant already covering the MCP server (D1).
resource webApp 'Microsoft.App/containerApps@2025-01-01' = {
  name: '${baseName}-web'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${webIdentity.id}': {} }
  }
  dependsOn: [webAcrPull]
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      ingress: {
        external: true
        targetPort: webPort
        transport: 'auto'
        allowInsecure: false
        customDomains: webCustomDomains
      }
      registries: [
        {
          server: registry.properties.loginServer
          identity: webIdentity.id
        }
      ]
      secrets: concat(
        empty(sessionSecret) ? [] : [
          { name: 'widgentic-session-secret', value: sessionSecret }
        ],
        empty(githubClientSecret) ? [] : [
          { name: 'widgentic-github-client-secret', value: githubClientSecret }
        ],
        empty(authClientSecret) ? [] : [
          { name: 'widgentic-auth-client-secret', value: authClientSecret }
        ]
      )
    }
    template: {
      containers: [
        {
          name: 'widgentic-web'
          image: webImage
          // The web entry (apps/web/http.ts) instead of the MCP one.
          command: ['npx', 'tsx', 'apps/web/http.ts']
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: concat(
            [
              { name: 'PORT', value: string(webPort) }
              { name: 'WIDGENTIC_COSMOS_ENDPOINT', value: cosmos.properties.documentEndpoint }
              { name: 'AZURE_CLIENT_ID', value: webIdentity.properties.clientId }
            ],
            empty(authIssuer) ? [] : [
              { name: 'WIDGENTIC_AUTH_ISSUER', value: authIssuer }
              { name: 'WIDGENTIC_AUTH_CLIENT_ID', value: authClientId }
              { name: 'WIDGENTIC_AUTH_REDIRECT_URI', value: 'https://${baseName}.dev/auth/callback' }
            ],
            empty(sessionSecret) ? [] : [
              { name: 'WIDGENTIC_SESSION_SECRET', secretRef: 'widgentic-session-secret' }
            ],
            empty(githubClientSecret) ? [] : [
              { name: 'WIDGENTIC_GITHUB_CLIENT_ID', value: githubClientId }
              { name: 'WIDGENTIC_GITHUB_CLIENT_SECRET', secretRef: 'widgentic-github-client-secret' }
              { name: 'WIDGENTIC_GITHUB_REDIRECT_URI', value: 'https://${baseName}.dev/auth/github/callback' }
            ],
            empty(authClientSecret) ? [] : [
              { name: 'WIDGENTIC_AUTH_CLIENT_SECRET', secretRef: 'widgentic-auth-client-secret' }
            ]
          )
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/healthz', port: webPort }
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
output webAppUrl string = 'https://${webApp.properties.configuration.ingress.fqdn}'
output webAppName string = webApp.name
output cosmosEndpoint string = cosmos.properties.documentEndpoint
