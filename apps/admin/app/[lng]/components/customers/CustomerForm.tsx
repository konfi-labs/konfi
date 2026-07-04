import { useT } from "@/i18n/client";
import { auth, firestore } from "@/lib/firebase/clientApp";
import { useTenantContext } from "@/context/tenant";
import {
  assertSaasRuntimeQuotaAction,
  recordSaasRuntimeQuotaUsageAction,
} from "@/actions/saas-runtime-quotas";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import { create, db, getDoc, update } from "@konfi/firebase";
import {
  Customer,
  CustomerCreate,
  CustomerUpdate,
  FormTypes,
  NestedMember,
  TenantContext,
} from "@konfi/types";
import {
  CustomerCreateSchema,
  customerForm,
  CustomerUpdateSchema,
  generateKeywords,
  getIconByFormType,
} from "@konfi/utils";
import { useChannels } from "context/channels";
import { useCustomers } from "context/customers";
import { isNull } from "es-toolkit";
import { arrayRemove, arrayUnion, Timestamp } from "firebase/firestore";
import { TFunction } from "i18next";
import { Dispatch, SetStateAction, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import useSWRImmutable from "swr/immutable";
import { InferType } from "yup";
import Drawer from "../Drawer";
import { By } from "../form/field-controllers/By";
import { fetchCustomerGroupOptions } from "./customer-groups";
import {
  initialValuesCreate,
  initialValuesDuplicate,
  initialValuesUpdate,
  initialValuesUpdateEmpty,
} from "./customer-form-values";

type CreateInput = InferType<typeof CustomerCreateSchema>;
type UpdateInput = InferType<typeof CustomerUpdateSchema>;

export default function CustomerForm({
  customer,
  type,
  open,
  setOpen,
  onSuccess,
}: {
  customer?: Customer;
  type: keyof typeof FormTypes;
  open?: boolean;
  setOpen?: Dispatch<SetStateAction<boolean>>;
  onSuccess?: () => void;
}) {
  const { t, i18n } = useT();
  const { refreshCustomers } = useCustomers();
  const { channel } = useChannels();
  const tenantContext = useTenantContext();
  const { data: customerGroupOptions } = useSWRImmutable(
    ["/customerGroups/options", tenantContext],
    ([, context]) => fetchCustomerGroupOptions(context),
  );
  const label = `${t(`FormTypes.${type}`)} Klienta`;
  const CreateSchemaYupResolver = yupResolver(CustomerCreateSchema);
  const UpdateSchemaYupResolver = yupResolver(CustomerUpdateSchema);
  const lastResetTargetRef = useRef<{
    customer: Customer | undefined;
    type: keyof typeof FormTypes;
  } | null>(null);

  const CreateForm = useForm({
    defaultValues: initialValuesCreate(),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "CREATE",
  });

  const UpdateForm = useForm({
    defaultValues: customer
      ? initialValuesUpdate(customer)
      : initialValuesUpdateEmpty(),
    resolver: UpdateSchemaYupResolver,
    disabled: type !== "UPDATE",
  });

  const DuplicateForm = useForm({
    defaultValues: customer
      ? initialValuesDuplicate(customer)
      : initialValuesCreate(),
    resolver: CreateSchemaYupResolver,
    disabled: type !== "DUPLICATE",
  });

  useEffect(() => {
    if (!open) {
      lastResetTargetRef.current = null;
      return;
    }

    const lastResetTarget = lastResetTargetRef.current;

    if (
      lastResetTarget?.type === type &&
      lastResetTarget.customer === customer
    ) {
      return;
    }

    lastResetTargetRef.current = { customer, type };

    // Reset form when the drawer opens or the selected customer changes.
    if (type === "UPDATE" && customer) {
      UpdateForm.reset(initialValuesUpdate(customer));
    } else if (type === "DUPLICATE" && customer) {
      DuplicateForm.reset(initialValuesDuplicate(customer));
    } else if (type === "CREATE") {
      CreateForm.reset(initialValuesCreate());
    }
  }, [CreateForm, DuplicateForm, UpdateForm, open, customer, type]);

  if (isNull(channel)) return null;

  if (type === "CREATE" && CreateForm.formState.disabled) return null;
  if (type === "UPDATE" && UpdateForm.formState.disabled) return null;
  if (type === "DUPLICATE" && DuplicateForm.formState.disabled) return null;

  return (
    <Drawer header={label} size={"xl"} open={open} setOpen={setOpen}>
      <FormController
        methods={
          type === "CREATE"
            ? CreateForm
            : type === "UPDATE"
              ? UpdateForm
              : DuplicateForm
        }
        buttonLeftIcon={getIconByFormType(type)}
        buttonLabel={label}
        submitLoadingLabel={
          type === "UPDATE"
            ? t("toasts.customer.updating", {
                defaultValue: "Saving customer...",
              })
            : t("toasts.customer.creating", {
                defaultValue: "Creating customer...",
              })
        }
        formData={customerForm(t, customerGroupOptions ?? [])}
        update={type === "UPDATE"}
        handleSubmit={async (data) =>
          type === "CREATE" || type === "DUPLICATE"
            ? await handleCreateCustomer(
                t,
                data,
                refreshCustomers,
                tenantContext,
                onSuccess,
              )
            : customer
              ? await handleUpdateCustomer(
                  t,
                  customer.id,
                  customer.customerGroupIds,
                  data,
                  refreshCustomers,
                  tenantContext,
                  onSuccess,
                )
              : toaster.error({
                  title: t("errors.somethingWentWrong"),
                  description: t("errors.customer.notFound"),
                  duration: 3000,
                })
        }
        By={<By update={type === "UPDATE"} />}
        t={t}
        i18n={i18n}
      />
    </Drawer>
  );
}

const handleCreateCustomer = async (
  t: TFunction,
  data: CreateInput,
  refreshCustomers: () => void,
  tenantContext: TenantContext,
  onSuccess?: () => void,
) => {
  try {
    let authUid: string | undefined = undefined;
    let existingCustomer: Customer | undefined = undefined;

    // If email is provided, check Firebase Auth for existing account
    if (data.email && data.email.trim()) {
      try {
        const currentUser = auth.currentUser;

        if (currentUser) {
          const idToken = await currentUser.getIdToken();
          // Call API route to lookup user by email
          const response = await fetch("/api/customers/auth-lookup", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ email: data.email.trim().toLowerCase() }),
          });

          if (response.ok) {
            const result = await response.json();
            if (result.uid) {
              authUid = result.uid;
              console.info(
                `Found existing auth user for email ${data.email}: ${authUid}`,
              );

              // Check if customer already exists with this auth ID
              if (authUid) {
                const customerDoc = await getDoc(
                  db.doc<Customer>(firestore, "/customers", authUid),
                );
                if (customerDoc) {
                  existingCustomer = customerDoc;
                  console.info(
                    `Found existing customer with auth ID: ${authUid}`,
                  );
                }
              }
            }
          }
        }
      } catch (error) {
        // Gracefully handle any errors - allow customer creation to continue
        console.warn(
          "Failed to lookup Firebase Auth user, continuing with customer creation:",
          error,
        );
      }
    }

    // If customer already exists, update it instead
    if (existingCustomer && authUid) {
      const customerUpdate: CustomerUpdate = {
        name: data.name,
        personName: data.personName,
        email: data.email,
        nip: data.nip,
        allowedBankPayments: data.allowedBankPayments,
        allowedOnPickupPayments: data.allowedOnPickupPayments,
        allowedDefferedPayments: data.allowedDefferedPayments,
        contacts: data.contacts,
        addresses: data.addresses,
        specialNotes: data.specialNotes,
        discount: data.discount,
        b2b: data.b2b,
        customerGroupIds: data.customerGroupIds,
        updatedBy: {
          id: data.createdBy.id,
          name: data.createdBy.name,
        },
        updatedAt: Timestamp.now(),
        keywords: generateKeywords(data.name),
      };

      await update(
        customerUpdate,
        db.doc(firestore, "/customers", authUid),
        tenantContext,
      );
      await syncCustomerGroupMembership(
        authUid,
        existingCustomer.customerGroupIds,
        data.customerGroupIds,
        customerUpdate.updatedBy,
        tenantContext,
      );
      refreshCustomers();
      if (onSuccess) onSuccess();

      toaster.success({
        title: t("toasts.customer.updated"),
        description: t("toasts.customer.updatedDescription", {
          name: data.name,
        }),
      });
      return;
    }

    // Create new customer
    await assertSaasRuntimeQuotaAction({
      operation: "admin.customer.create",
      resource: "customers",
    });

    const customer: CustomerCreate = {
      id: authUid || "", // Use auth UID if available
      name: data.name,
      personName: data.personName,
      email: data.email,
      nip: data.nip,
      allowedBankPayments: data.allowedBankPayments,
      allowedOnPickupPayments: data.allowedOnPickupPayments,
      allowedDefferedPayments: data.allowedDefferedPayments,
      contacts: data.contacts,
      addresses: data.addresses,
      specialNotes: data.specialNotes,
      discount: data.discount,
      b2b: data.b2b,
      customerGroupIds: data.customerGroupIds,
      createdBy: {
        id: data.createdBy.id,
        name: data.createdBy.name,
      },
      createdAt: Timestamp.now(),
      updatedBy: {
        id: data.createdBy.id,
        name: data.createdBy.name,
      },
      updatedAt: Timestamp.now(),
      keywords: generateKeywords(data.name),
      active: true,
      linkedAuthId: authUid, // Link to auth account if found
    };

    // Use specific document reference if we have an auth UID
    const docRef = authUid
      ? db.doc<Customer>(firestore, "/customers", authUid)
      : undefined;

    const customerId = await create(
      firestore,
      customer,
      docRef,
      docRef ? undefined : db.collection(firestore, "/customers"),
      db.collection(firestore, "/customers"),
      undefined,
      undefined,
      undefined,
      undefined,
      tenantContext,
    );
    if (customerId) {
      await syncCustomerGroupMembership(
        customerId,
        [],
        data.customerGroupIds,
        customer.createdBy,
        tenantContext,
      );
    }
    await recordSaasRuntimeQuotaUsageAction({
      operation: "admin.customer.create",
      resource: "customers",
    });

    refreshCustomers();
    if (onSuccess) onSuccess();
    toaster.success({
      title: t("toasts.customer.created"),
      description: t("toasts.customer.createdDescription"),
    });
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("errors.somethingWentWrong"),
      description: t("toasts.customer.notCreated", { error }),
    });
  }
};

const handleUpdateCustomer = async (
  t: TFunction,
  customerId: Customer["id"],
  previousCustomerGroupIds: Customer["customerGroupIds"],
  data: UpdateInput,
  refreshCustomers: () => void,
  tenantContext: TenantContext,
  onSuccess?: () => void,
) => {
  try {
    const customer: CustomerUpdate = {
      name: data.name,
      personName: data.personName,
      email: data.email,
      nip: data.nip,
      allowedDefferedPayments: data.allowedDefferedPayments,
      allowedBankPayments: data.allowedBankPayments,
      allowedOnPickupPayments: data.allowedOnPickupPayments,
      contacts: data.contacts,
      addresses: data.addresses,
      specialNotes: data.specialNotes,
      discount: data.discount,
      b2b: data.b2b,
      customerGroupIds: data.customerGroupIds,
      updatedBy: {
        id: data.updatedBy.id,
        name: data.updatedBy.name,
      },
      updatedAt: Timestamp.now(),
      keywords: generateKeywords(data.name),
    };
    await update(
      customer,
      db.doc(firestore, "/customers", customerId),
      tenantContext,
    );
    await syncCustomerGroupMembership(
      customerId,
      previousCustomerGroupIds,
      data.customerGroupIds,
      customer.updatedBy,
      tenantContext,
    );
    refreshCustomers();
    if (onSuccess) onSuccess();
    toaster.success({
      title: t("toasts.customer.updated"),
      description: t("toasts.customer.updatedDescription", { name: data.name }),
    });
  } catch (error) {
    console.error(error);
    toaster.error({
      title: t("errors.somethingWentWrong"),
      description: t("toasts.customer.notUpdated", { error }),
    });
  }
};

const syncCustomerGroupMembership = async (
  customerId: Customer["id"],
  previousCustomerGroupIds: string[] | undefined,
  nextCustomerGroupIds: string[] | undefined,
  updatedBy: NestedMember,
  tenantContext: TenantContext,
) => {
  const previousIds = new Set(previousCustomerGroupIds ?? []);
  const nextIds = new Set(nextCustomerGroupIds ?? []);
  const addedCustomerGroupIds = [...nextIds].filter(
    (customerGroupId) => !previousIds.has(customerGroupId),
  );
  const removedCustomerGroupIds = [...previousIds].filter(
    (customerGroupId) => !nextIds.has(customerGroupId),
  );
  const updatedAt = Timestamp.now();

  await Promise.all([
    ...addedCustomerGroupIds.map((customerGroupId) =>
      update(
        {
          customerIds: arrayUnion(customerId),
          updatedBy,
          updatedAt,
        },
        db.doc<Record<string, unknown>>(
          firestore,
          "/customerGroups",
          customerGroupId,
        ),
        tenantContext,
      ),
    ),
    ...removedCustomerGroupIds.map((customerGroupId) =>
      update(
        {
          customerIds: arrayRemove(customerId),
          updatedBy,
          updatedAt,
        },
        db.doc<Record<string, unknown>>(
          firestore,
          "/customerGroups",
          customerGroupId,
        ),
        tenantContext,
      ),
    ),
  ]);
};
