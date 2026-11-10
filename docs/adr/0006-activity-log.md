# Activity is one table written by domain services

What happened to a Task, Monthly, Note, or Section is one `activity` row, inserted by the domain service in the same transaction as the mutation. Server Actions and Route Handlers do not write it, so every caller shares the same record. `entity_id` is not a foreign key, for the same reason as `notification_log.entity_id`: the row outlives the entity. `actor_user_id` is the Better Auth text user id and is set null when that user is deleted.

There is no `source` column until an assistant exists. Actions and REST are both the Member, and the service has no meaningful origin to store. A nullable column with nothing to put in it would be speculative. There is no retention delete in v1. Pagination bounds reads. A future prune must keep Monthly `completed` rows, because those rows hold the period and the previous completion fields. Web reads are Server Actions. REST reads wait for a non-web client and should call these services.
