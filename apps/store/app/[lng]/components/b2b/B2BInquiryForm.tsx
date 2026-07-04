import { firestore } from "@/lib/firebase/clientApp";
import { sendB2BInquiryNotificationEmail } from "app/actions/b2b";
import { CreateToasterReturn, Spinner } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { FormController, toaster } from "@konfi/components";
import { create, db, getCustomer } from "@konfi/firebase";
import {
  AddressTypeEnum,
  B2BInquiryStatus,
  CreateB2BInquiry,
} from "@konfi/types";
import { b2bForm, B2BInquiryCreateSchema } from "@konfi/utils";
import { useAuth } from "@/context/auth";
import { User } from "firebase/auth";
import { Timestamp, updateDoc } from "firebase/firestore";
import { TFunction } from "i18next";
import { useForm } from "react-hook-form";
import { useT } from "@/i18n/client";
import { InferType } from "yup";

type Input = InferType<typeof B2BInquiryCreateSchema>;

const B2BInquiryForm = () => {
  const { appCheckToken, user } = useAuth();
  const { t, i18n } = useT();
  const SchemaYupResolver = yupResolver(B2BInquiryCreateSchema);
  const CreateForm = useForm({
    defaultValues: initialValues(),
    resolver: SchemaYupResolver,
  });

  if (!user) return <Spinner />;

  return (
    <FormController
      methods={CreateForm}
      buttonLeftIcon={"https"}
      buttonLabel={t("store.sendForm", { defaultValue: "Send form" })}
      formData={b2bForm(t)}
      handleSubmit={(data) =>
        handleCreateOrder(data, user, appCheckToken?.token, toaster, t)
      }
      t={t}
      i18n={i18n}
    />
  );
};

const initialValues = () => {
  const values: Input = {
    businessDescription: "",
    billing: {
      type: AddressTypeEnum.BILLING,
      name: "",
      companyName: "",
      nip: "",
      street: "",
      number: "",
      local: "",
      zip: "",
      city: "",
      country: "Polska",
      active: true,
    },
  };
  return values;
};

async function handleCreateOrder(
  data: Input,
  user: User,
  appCheckToken: string | undefined,
  toast: CreateToasterReturn,
  t: TFunction,
) {
  try {
    const customer = await getCustomer(firestore, user.uid);
    console.log(data);
    if (!customer) {
      toast.error({
        title: t("store.customerNotFound", {
          defaultValue: "Customer not found",
        }),
      });
      return;
    }
    if (customer.b2bInquiryId) {
      toast.error({
        title: t("store.activeFormExists", {
          defaultValue: "You already have an active form",
        }),
        description: t("store.activeFormExistsDesc", {
          defaultValue: "You can see it in the B2B tab",
        }),
      });
      return;
    }
    const b2bInquiry: CreateB2BInquiry = {
      id: "",
      businessDescription: data.businessDescription,
      billing: data.billing,
      userId: user.uid,
      status: B2BInquiryStatus.NEW,
      createdBy: {
        id: "system",
        name: "System",
      },
      updatedBy: {
        id: "system",
        name: "System",
      },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    const id = await create(
      firestore,
      b2bInquiry,
      undefined,
      db.collection(firestore, "/b2bInquiries"),
      undefined,
    );
    if (!id) {
      throw new Error("B2B inquiry was not created.");
    }

    await updateDoc(db.doc(firestore, "/customers", user.uid), {
      b2bInquiryId: id,
    });

    const idToken = await user.getIdToken();
    const notificationResult = await sendB2BInquiryNotificationEmail({
      appCheckToken,
      idToken,
      inquiryId: id,
    });

    if (!notificationResult.sent) {
      toast.create({
        title: t("common.warning", { defaultValue: "Warning!" }),
        description: t("store.b2bNotificationFailed", {
          defaultValue:
            "Your request was saved, but the notification email could not be sent.",
        }),
        type: "info",
      });
    }
    toast.success({
      title: t("store.formSent", { defaultValue: "Form has been sent" }),
    });
  } catch (error) {
    console.error(error);
    toast.error({
      title: t("store.somethingWentWrong", {
        defaultValue: "Something went wrong",
      }),
      description: t("store.errorCode", {
        defaultValue: "Error code: {{error}}",
      }).replace("{{error}}", `${error}`),
    });
  }
}

export default B2BInquiryForm;
