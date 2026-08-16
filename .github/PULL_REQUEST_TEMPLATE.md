name: Pull Request
description: Describe the change in this pull request
title: "[PR]: "
labels: []
body:

- type: textarea
  id: summary
  attributes:
  label: Summary
  description: What changed and why.
  validations:
  required: true
- type: textarea
  id: tests
  attributes:
  label: Verification
  description: What checks did you run (typecheck, lint, format, tests, build, live conversion)?
  validations:
  required: true
- type: checkboxes
  id: checklist
  attributes:
  label: Checklist
  options: - label: Ran `npm run typecheck` and `npm run lint` - label: Ran `npm run format:check` - label: Ran `npm test -- --coverage` - label: Ran `npm run build`
