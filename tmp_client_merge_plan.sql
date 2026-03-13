-- =====================================================
-- VIHOLABS — PROPOSED CLIENT MERGE SQL
-- GENERATED AUTOMATICALLY
-- REVIEW BEFORE EXECUTION
-- =====================================================

begin;

-- -----------------------------------------------------
-- BLANCA GALOFRE MUNNE -> BLANCA GALOFRÉ MUNNÉ (HOMEDICAL)
-- source: f8e46f44-906f-45a9-a6ac-306f6e805add
-- target: 51661407-9f1b-450c-aff4-7a0dd6ca4595
-- -----------------------------------------------------

update orders
set client_id = '51661407-9f1b-450c-aff4-7a0dd6ca4595'
where client_id = 'f8e46f44-906f-45a9-a6ac-306f6e805add';

update draft_orders
set client_id = '51661407-9f1b-450c-aff4-7a0dd6ca4595'
where client_id = 'f8e46f44-906f-45a9-a6ac-306f6e805add';

update invoices
set client_id = '51661407-9f1b-450c-aff4-7a0dd6ca4595'
where client_id = 'f8e46f44-906f-45a9-a6ac-306f6e805add';

update client_assignments
set client_id = '51661407-9f1b-450c-aff4-7a0dd6ca4595'
where client_id = 'f8e46f44-906f-45a9-a6ac-306f6e805add';

update client_aliases
set client_id = '51661407-9f1b-450c-aff4-7a0dd6ca4595'
where client_id = 'f8e46f44-906f-45a9-a6ac-306f6e805add';

update client_addresses
set client_id = '51661407-9f1b-450c-aff4-7a0dd6ca4595'
where client_id = 'f8e46f44-906f-45a9-a6ac-306f6e805add';

update client_contacts
set client_id = '51661407-9f1b-450c-aff4-7a0dd6ca4595'
where client_id = 'f8e46f44-906f-45a9-a6ac-306f6e805add';

update client_notes
set client_id = '51661407-9f1b-450c-aff4-7a0dd6ca4595'
where client_id = 'f8e46f44-906f-45a9-a6ac-306f6e805add';

update client_tags
set client_id = '51661407-9f1b-450c-aff4-7a0dd6ca4595'
where client_id = 'f8e46f44-906f-45a9-a6ac-306f6e805add';

update actor_client_assignments
set client_id = '51661407-9f1b-450c-aff4-7a0dd6ca4595'
where client_id = 'f8e46f44-906f-45a9-a6ac-306f6e805add';

update delegate_clients
set client_id = '51661407-9f1b-450c-aff4-7a0dd6ca4595'
where client_id = 'f8e46f44-906f-45a9-a6ac-306f6e805add';

update commission_lines
set client_id = '51661407-9f1b-450c-aff4-7a0dd6ca4595'
where client_id = 'f8e46f44-906f-45a9-a6ac-306f6e805add';

update commission_draft_lines
set client_id = '51661407-9f1b-450c-aff4-7a0dd6ca4595'
where client_id = 'f8e46f44-906f-45a9-a6ac-306f6e805add';

update settlement_lines
set client_id = '51661407-9f1b-450c-aff4-7a0dd6ca4595'
where client_id = 'f8e46f44-906f-45a9-a6ac-306f6e805add';

update shipments
set client_id = '51661407-9f1b-450c-aff4-7a0dd6ca4595'
where client_id = 'f8e46f44-906f-45a9-a6ac-306f6e805add';

update credit_notes
set client_id = '51661407-9f1b-450c-aff4-7a0dd6ca4595'
where client_id = 'f8e46f44-906f-45a9-a6ac-306f6e805add';

update client_merge_audit
set target_client_id = '51661407-9f1b-450c-aff4-7a0dd6ca4595'
where target_client_id = 'f8e46f44-906f-45a9-a6ac-306f6e805add';

update client_merge_audit
set source_client_id = '51661407-9f1b-450c-aff4-7a0dd6ca4595'
where source_client_id = 'f8e46f44-906f-45a9-a6ac-306f6e805add';

update clients
set holded_contact_id = null
where id = 'f8e46f44-906f-45a9-a6ac-306f6e805add';

-- delete from clients where id = 'f8e46f44-906f-45a9-a6ac-306f6e805add';

-- -----------------------------------------------------
-- Encarnacion Martin Ruiz -> Encarnacion Martín Ruiz
-- source: 8deeed7c-8236-435b-bc68-848230750a45
-- target: 070edcff-ecd1-4516-96cd-2b72abb93299
-- -----------------------------------------------------

update orders
set client_id = '070edcff-ecd1-4516-96cd-2b72abb93299'
where client_id = '8deeed7c-8236-435b-bc68-848230750a45';

update draft_orders
set client_id = '070edcff-ecd1-4516-96cd-2b72abb93299'
where client_id = '8deeed7c-8236-435b-bc68-848230750a45';

update invoices
set client_id = '070edcff-ecd1-4516-96cd-2b72abb93299'
where client_id = '8deeed7c-8236-435b-bc68-848230750a45';

update client_assignments
set client_id = '070edcff-ecd1-4516-96cd-2b72abb93299'
where client_id = '8deeed7c-8236-435b-bc68-848230750a45';

update client_aliases
set client_id = '070edcff-ecd1-4516-96cd-2b72abb93299'
where client_id = '8deeed7c-8236-435b-bc68-848230750a45';

update client_addresses
set client_id = '070edcff-ecd1-4516-96cd-2b72abb93299'
where client_id = '8deeed7c-8236-435b-bc68-848230750a45';

update client_contacts
set client_id = '070edcff-ecd1-4516-96cd-2b72abb93299'
where client_id = '8deeed7c-8236-435b-bc68-848230750a45';

update client_notes
set client_id = '070edcff-ecd1-4516-96cd-2b72abb93299'
where client_id = '8deeed7c-8236-435b-bc68-848230750a45';

update client_tags
set client_id = '070edcff-ecd1-4516-96cd-2b72abb93299'
where client_id = '8deeed7c-8236-435b-bc68-848230750a45';

update actor_client_assignments
set client_id = '070edcff-ecd1-4516-96cd-2b72abb93299'
where client_id = '8deeed7c-8236-435b-bc68-848230750a45';

update delegate_clients
set client_id = '070edcff-ecd1-4516-96cd-2b72abb93299'
where client_id = '8deeed7c-8236-435b-bc68-848230750a45';

update commission_lines
set client_id = '070edcff-ecd1-4516-96cd-2b72abb93299'
where client_id = '8deeed7c-8236-435b-bc68-848230750a45';

update commission_draft_lines
set client_id = '070edcff-ecd1-4516-96cd-2b72abb93299'
where client_id = '8deeed7c-8236-435b-bc68-848230750a45';

update settlement_lines
set client_id = '070edcff-ecd1-4516-96cd-2b72abb93299'
where client_id = '8deeed7c-8236-435b-bc68-848230750a45';

update shipments
set client_id = '070edcff-ecd1-4516-96cd-2b72abb93299'
where client_id = '8deeed7c-8236-435b-bc68-848230750a45';

update credit_notes
set client_id = '070edcff-ecd1-4516-96cd-2b72abb93299'
where client_id = '8deeed7c-8236-435b-bc68-848230750a45';

update client_merge_audit
set target_client_id = '070edcff-ecd1-4516-96cd-2b72abb93299'
where target_client_id = '8deeed7c-8236-435b-bc68-848230750a45';

update client_merge_audit
set source_client_id = '070edcff-ecd1-4516-96cd-2b72abb93299'
where source_client_id = '8deeed7c-8236-435b-bc68-848230750a45';

update clients
set holded_contact_id = null
where id = '8deeed7c-8236-435b-bc68-848230750a45';

-- delete from clients where id = '8deeed7c-8236-435b-bc68-848230750a45';

-- -----------------------------------------------------
-- Monica Falla Pérez -> Mònica Falla Pérez
-- source: c69b3ea0-4889-44f9-8205-7fad303c823f
-- target: 85c9287e-2ba9-4336-a5b9-70c8f217b2f7
-- -----------------------------------------------------

update orders
set client_id = '85c9287e-2ba9-4336-a5b9-70c8f217b2f7'
where client_id = 'c69b3ea0-4889-44f9-8205-7fad303c823f';

update draft_orders
set client_id = '85c9287e-2ba9-4336-a5b9-70c8f217b2f7'
where client_id = 'c69b3ea0-4889-44f9-8205-7fad303c823f';

update invoices
set client_id = '85c9287e-2ba9-4336-a5b9-70c8f217b2f7'
where client_id = 'c69b3ea0-4889-44f9-8205-7fad303c823f';

update client_assignments
set client_id = '85c9287e-2ba9-4336-a5b9-70c8f217b2f7'
where client_id = 'c69b3ea0-4889-44f9-8205-7fad303c823f';

update client_aliases
set client_id = '85c9287e-2ba9-4336-a5b9-70c8f217b2f7'
where client_id = 'c69b3ea0-4889-44f9-8205-7fad303c823f';

update client_addresses
set client_id = '85c9287e-2ba9-4336-a5b9-70c8f217b2f7'
where client_id = 'c69b3ea0-4889-44f9-8205-7fad303c823f';

update client_contacts
set client_id = '85c9287e-2ba9-4336-a5b9-70c8f217b2f7'
where client_id = 'c69b3ea0-4889-44f9-8205-7fad303c823f';

update client_notes
set client_id = '85c9287e-2ba9-4336-a5b9-70c8f217b2f7'
where client_id = 'c69b3ea0-4889-44f9-8205-7fad303c823f';

update client_tags
set client_id = '85c9287e-2ba9-4336-a5b9-70c8f217b2f7'
where client_id = 'c69b3ea0-4889-44f9-8205-7fad303c823f';

update actor_client_assignments
set client_id = '85c9287e-2ba9-4336-a5b9-70c8f217b2f7'
where client_id = 'c69b3ea0-4889-44f9-8205-7fad303c823f';

update delegate_clients
set client_id = '85c9287e-2ba9-4336-a5b9-70c8f217b2f7'
where client_id = 'c69b3ea0-4889-44f9-8205-7fad303c823f';

update commission_lines
set client_id = '85c9287e-2ba9-4336-a5b9-70c8f217b2f7'
where client_id = 'c69b3ea0-4889-44f9-8205-7fad303c823f';

update commission_draft_lines
set client_id = '85c9287e-2ba9-4336-a5b9-70c8f217b2f7'
where client_id = 'c69b3ea0-4889-44f9-8205-7fad303c823f';

update settlement_lines
set client_id = '85c9287e-2ba9-4336-a5b9-70c8f217b2f7'
where client_id = 'c69b3ea0-4889-44f9-8205-7fad303c823f';

update shipments
set client_id = '85c9287e-2ba9-4336-a5b9-70c8f217b2f7'
where client_id = 'c69b3ea0-4889-44f9-8205-7fad303c823f';

update credit_notes
set client_id = '85c9287e-2ba9-4336-a5b9-70c8f217b2f7'
where client_id = 'c69b3ea0-4889-44f9-8205-7fad303c823f';

update client_merge_audit
set target_client_id = '85c9287e-2ba9-4336-a5b9-70c8f217b2f7'
where target_client_id = 'c69b3ea0-4889-44f9-8205-7fad303c823f';

update client_merge_audit
set source_client_id = '85c9287e-2ba9-4336-a5b9-70c8f217b2f7'
where source_client_id = 'c69b3ea0-4889-44f9-8205-7fad303c823f';

update clients
set holded_contact_id = null
where id = 'c69b3ea0-4889-44f9-8205-7fad303c823f';

-- delete from clients where id = 'c69b3ea0-4889-44f9-8205-7fad303c823f';

-- -----------------------------------------------------
-- Monica Ramirez Guirao -> Mónica Ramírez Guirao
-- source: 08ffcd0e-54ee-4e35-9b16-8cac2d0f3188
-- target: 609be93a-3f39-4289-8e6d-a010163af9af
-- -----------------------------------------------------

update orders
set client_id = '609be93a-3f39-4289-8e6d-a010163af9af'
where client_id = '08ffcd0e-54ee-4e35-9b16-8cac2d0f3188';

update draft_orders
set client_id = '609be93a-3f39-4289-8e6d-a010163af9af'
where client_id = '08ffcd0e-54ee-4e35-9b16-8cac2d0f3188';

update invoices
set client_id = '609be93a-3f39-4289-8e6d-a010163af9af'
where client_id = '08ffcd0e-54ee-4e35-9b16-8cac2d0f3188';

update client_assignments
set client_id = '609be93a-3f39-4289-8e6d-a010163af9af'
where client_id = '08ffcd0e-54ee-4e35-9b16-8cac2d0f3188';

update client_aliases
set client_id = '609be93a-3f39-4289-8e6d-a010163af9af'
where client_id = '08ffcd0e-54ee-4e35-9b16-8cac2d0f3188';

update client_addresses
set client_id = '609be93a-3f39-4289-8e6d-a010163af9af'
where client_id = '08ffcd0e-54ee-4e35-9b16-8cac2d0f3188';

update client_contacts
set client_id = '609be93a-3f39-4289-8e6d-a010163af9af'
where client_id = '08ffcd0e-54ee-4e35-9b16-8cac2d0f3188';

update client_notes
set client_id = '609be93a-3f39-4289-8e6d-a010163af9af'
where client_id = '08ffcd0e-54ee-4e35-9b16-8cac2d0f3188';

update client_tags
set client_id = '609be93a-3f39-4289-8e6d-a010163af9af'
where client_id = '08ffcd0e-54ee-4e35-9b16-8cac2d0f3188';

update actor_client_assignments
set client_id = '609be93a-3f39-4289-8e6d-a010163af9af'
where client_id = '08ffcd0e-54ee-4e35-9b16-8cac2d0f3188';

update delegate_clients
set client_id = '609be93a-3f39-4289-8e6d-a010163af9af'
where client_id = '08ffcd0e-54ee-4e35-9b16-8cac2d0f3188';

update commission_lines
set client_id = '609be93a-3f39-4289-8e6d-a010163af9af'
where client_id = '08ffcd0e-54ee-4e35-9b16-8cac2d0f3188';

update commission_draft_lines
set client_id = '609be93a-3f39-4289-8e6d-a010163af9af'
where client_id = '08ffcd0e-54ee-4e35-9b16-8cac2d0f3188';

update settlement_lines
set client_id = '609be93a-3f39-4289-8e6d-a010163af9af'
where client_id = '08ffcd0e-54ee-4e35-9b16-8cac2d0f3188';

update shipments
set client_id = '609be93a-3f39-4289-8e6d-a010163af9af'
where client_id = '08ffcd0e-54ee-4e35-9b16-8cac2d0f3188';

update credit_notes
set client_id = '609be93a-3f39-4289-8e6d-a010163af9af'
where client_id = '08ffcd0e-54ee-4e35-9b16-8cac2d0f3188';

update client_merge_audit
set target_client_id = '609be93a-3f39-4289-8e6d-a010163af9af'
where target_client_id = '08ffcd0e-54ee-4e35-9b16-8cac2d0f3188';

update client_merge_audit
set source_client_id = '609be93a-3f39-4289-8e6d-a010163af9af'
where source_client_id = '08ffcd0e-54ee-4e35-9b16-8cac2d0f3188';

update clients
set holded_contact_id = null
where id = '08ffcd0e-54ee-4e35-9b16-8cac2d0f3188';

-- delete from clients where id = '08ffcd0e-54ee-4e35-9b16-8cac2d0f3188';

-- -----------------------------------------------------
-- Silvina Flavia Sanchez -> Silvina Flavia Sánchez
-- source: 3efabc7c-f3f4-43f5-a974-7c4360afea4c
-- target: dd0effca-6a28-464c-9a54-98fc393a33dd
-- -----------------------------------------------------

update orders
set client_id = 'dd0effca-6a28-464c-9a54-98fc393a33dd'
where client_id = '3efabc7c-f3f4-43f5-a974-7c4360afea4c';

update draft_orders
set client_id = 'dd0effca-6a28-464c-9a54-98fc393a33dd'
where client_id = '3efabc7c-f3f4-43f5-a974-7c4360afea4c';

update invoices
set client_id = 'dd0effca-6a28-464c-9a54-98fc393a33dd'
where client_id = '3efabc7c-f3f4-43f5-a974-7c4360afea4c';

update client_assignments
set client_id = 'dd0effca-6a28-464c-9a54-98fc393a33dd'
where client_id = '3efabc7c-f3f4-43f5-a974-7c4360afea4c';

update client_aliases
set client_id = 'dd0effca-6a28-464c-9a54-98fc393a33dd'
where client_id = '3efabc7c-f3f4-43f5-a974-7c4360afea4c';

update client_addresses
set client_id = 'dd0effca-6a28-464c-9a54-98fc393a33dd'
where client_id = '3efabc7c-f3f4-43f5-a974-7c4360afea4c';

update client_contacts
set client_id = 'dd0effca-6a28-464c-9a54-98fc393a33dd'
where client_id = '3efabc7c-f3f4-43f5-a974-7c4360afea4c';

update client_notes
set client_id = 'dd0effca-6a28-464c-9a54-98fc393a33dd'
where client_id = '3efabc7c-f3f4-43f5-a974-7c4360afea4c';

update client_tags
set client_id = 'dd0effca-6a28-464c-9a54-98fc393a33dd'
where client_id = '3efabc7c-f3f4-43f5-a974-7c4360afea4c';

update actor_client_assignments
set client_id = 'dd0effca-6a28-464c-9a54-98fc393a33dd'
where client_id = '3efabc7c-f3f4-43f5-a974-7c4360afea4c';

update delegate_clients
set client_id = 'dd0effca-6a28-464c-9a54-98fc393a33dd'
where client_id = '3efabc7c-f3f4-43f5-a974-7c4360afea4c';

update commission_lines
set client_id = 'dd0effca-6a28-464c-9a54-98fc393a33dd'
where client_id = '3efabc7c-f3f4-43f5-a974-7c4360afea4c';

update commission_draft_lines
set client_id = 'dd0effca-6a28-464c-9a54-98fc393a33dd'
where client_id = '3efabc7c-f3f4-43f5-a974-7c4360afea4c';

update settlement_lines
set client_id = 'dd0effca-6a28-464c-9a54-98fc393a33dd'
where client_id = '3efabc7c-f3f4-43f5-a974-7c4360afea4c';

update shipments
set client_id = 'dd0effca-6a28-464c-9a54-98fc393a33dd'
where client_id = '3efabc7c-f3f4-43f5-a974-7c4360afea4c';

update credit_notes
set client_id = 'dd0effca-6a28-464c-9a54-98fc393a33dd'
where client_id = '3efabc7c-f3f4-43f5-a974-7c4360afea4c';

update client_merge_audit
set target_client_id = 'dd0effca-6a28-464c-9a54-98fc393a33dd'
where target_client_id = '3efabc7c-f3f4-43f5-a974-7c4360afea4c';

update client_merge_audit
set source_client_id = 'dd0effca-6a28-464c-9a54-98fc393a33dd'
where source_client_id = '3efabc7c-f3f4-43f5-a974-7c4360afea4c';

update clients
set holded_contact_id = null
where id = '3efabc7c-f3f4-43f5-a974-7c4360afea4c';

-- delete from clients where id = '3efabc7c-f3f4-43f5-a974-7c4360afea4c';

-- -----------------------------------------------------
-- Ivette Fernandez Tornero -> Ivette Fernández Tornero
-- source: cb130d88-7ca6-4084-b892-bdd44eae8970
-- target: ae9c7cd1-9918-452b-b7d5-d6e77a5006ed
-- -----------------------------------------------------

update orders
set client_id = 'ae9c7cd1-9918-452b-b7d5-d6e77a5006ed'
where client_id = 'cb130d88-7ca6-4084-b892-bdd44eae8970';

update draft_orders
set client_id = 'ae9c7cd1-9918-452b-b7d5-d6e77a5006ed'
where client_id = 'cb130d88-7ca6-4084-b892-bdd44eae8970';

update invoices
set client_id = 'ae9c7cd1-9918-452b-b7d5-d6e77a5006ed'
where client_id = 'cb130d88-7ca6-4084-b892-bdd44eae8970';

update client_assignments
set client_id = 'ae9c7cd1-9918-452b-b7d5-d6e77a5006ed'
where client_id = 'cb130d88-7ca6-4084-b892-bdd44eae8970';

update client_aliases
set client_id = 'ae9c7cd1-9918-452b-b7d5-d6e77a5006ed'
where client_id = 'cb130d88-7ca6-4084-b892-bdd44eae8970';

update client_addresses
set client_id = 'ae9c7cd1-9918-452b-b7d5-d6e77a5006ed'
where client_id = 'cb130d88-7ca6-4084-b892-bdd44eae8970';

update client_contacts
set client_id = 'ae9c7cd1-9918-452b-b7d5-d6e77a5006ed'
where client_id = 'cb130d88-7ca6-4084-b892-bdd44eae8970';

update client_notes
set client_id = 'ae9c7cd1-9918-452b-b7d5-d6e77a5006ed'
where client_id = 'cb130d88-7ca6-4084-b892-bdd44eae8970';

update client_tags
set client_id = 'ae9c7cd1-9918-452b-b7d5-d6e77a5006ed'
where client_id = 'cb130d88-7ca6-4084-b892-bdd44eae8970';

update actor_client_assignments
set client_id = 'ae9c7cd1-9918-452b-b7d5-d6e77a5006ed'
where client_id = 'cb130d88-7ca6-4084-b892-bdd44eae8970';

update delegate_clients
set client_id = 'ae9c7cd1-9918-452b-b7d5-d6e77a5006ed'
where client_id = 'cb130d88-7ca6-4084-b892-bdd44eae8970';

update commission_lines
set client_id = 'ae9c7cd1-9918-452b-b7d5-d6e77a5006ed'
where client_id = 'cb130d88-7ca6-4084-b892-bdd44eae8970';

update commission_draft_lines
set client_id = 'ae9c7cd1-9918-452b-b7d5-d6e77a5006ed'
where client_id = 'cb130d88-7ca6-4084-b892-bdd44eae8970';

update settlement_lines
set client_id = 'ae9c7cd1-9918-452b-b7d5-d6e77a5006ed'
where client_id = 'cb130d88-7ca6-4084-b892-bdd44eae8970';

update shipments
set client_id = 'ae9c7cd1-9918-452b-b7d5-d6e77a5006ed'
where client_id = 'cb130d88-7ca6-4084-b892-bdd44eae8970';

update credit_notes
set client_id = 'ae9c7cd1-9918-452b-b7d5-d6e77a5006ed'
where client_id = 'cb130d88-7ca6-4084-b892-bdd44eae8970';

update clients
set holded_contact_id = '695b763a3857a4886a00c390'
where id = 'ae9c7cd1-9918-452b-b7d5-d6e77a5006ed'
  and (holded_contact_id is null or holded_contact_id = '');

update client_merge_audit
set target_client_id = 'ae9c7cd1-9918-452b-b7d5-d6e77a5006ed'
where target_client_id = 'cb130d88-7ca6-4084-b892-bdd44eae8970';

update client_merge_audit
set source_client_id = 'ae9c7cd1-9918-452b-b7d5-d6e77a5006ed'
where source_client_id = 'cb130d88-7ca6-4084-b892-bdd44eae8970';

update clients
set holded_contact_id = null
where id = 'cb130d88-7ca6-4084-b892-bdd44eae8970';

-- delete from clients where id = 'cb130d88-7ca6-4084-b892-bdd44eae8970';

-- review results first, then commit
-- commit;
-- rollback;
