{{- define "aqond.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "aqond.fullname" -}}
{{- printf "%s-%s" .Release.Name (include "aqond.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "aqond.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
app.kubernetes.io/name: {{ include "aqond.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
aqond.io/part-of: aqond-v2
aqond.io/env: {{ .Values.global.env }}
aqond.io/region: {{ .Values.global.region }}
{{- end }}

{{- define "aqond.selectorLabels" -}}
app.kubernetes.io/name: {{ include "aqond.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "aqond.serviceAccountName" -}}
{{- if .Values.security.serviceAccount.create }}
{{- default (include "aqond.fullname" .) .Values.security.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.security.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "aqond.image" -}}
{{- $reg := .Values.global.imageRegistry -}}
{{- $name := .name -}}
{{- $tag := .Values.global.imageTag -}}
{{ $reg }}/{{ $name }}:{{ $tag }}
{{- end }}

{{- define "aqond.commonEnv" -}}
- name: AQOND_ENV
  value: {{ .Values.global.env | quote }}
- name: AQOND_DEFAULT_REGION
  value: {{ .Values.global.region | quote }}
- name: PGHOST
  value: {{ if .Values.citus.enabled }}{{ .Values.citus.coordinatorHost | quote }}{{ else }}{{ .Values.postgres.host | quote }}{{ end }}
- name: PGPORT
  value: {{ .Values.postgres.port | quote }}
- name: PGDATABASE
  value: {{ .Values.postgres.database | quote }}
- name: PGUSER
  value: {{ .Values.postgres.user | quote }}
- name: PGPASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ .Values.postgres.existingSecret }}
      key: POSTGRES_PASSWORD
- name: PGREADHOST
  value: {{ .Values.postgres.host | quote }}
- name: REDIS_ADDR
  value: {{ .Values.redis.addr | quote }}
{{- if .Values.redis.cluster }}
- name: REDIS_CLUSTER
  value: "1"
- name: REDIS_CLUSTER_ADDRS
  value: {{ .Values.redis.clusterAddrs | quote }}
{{- end }}
{{- if .Values.kafka.enabled }}
- name: KAFKA_BROKERS
  value: {{ .Values.kafka.brokers | quote }}
{{- end }}
{{- if .Values.citus.enabled }}
- name: USE_CITUS
  value: "1"
{{- end }}
{{- if .Values.observability.otelCollector }}
- name: OTEL_ENABLED
  value: "1"
- name: OTEL_EXPORTER_OTLP_ENDPOINT
  value: "http://otel-collector:4318"
{{- end }}
{{- end }}
