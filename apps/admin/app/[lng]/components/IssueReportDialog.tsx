"use client";

import {
  createGitHubIssue,
  listGitHubIssues,
  searchGitHubIssues,
} from "@/actions/github";
import { useT } from "@/i18n/client";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CloseButton,
  Dialog,
  Field,
  HStack,
  Link,
  Portal,
  SimpleGrid,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol, toaster } from "@konfi/components";
import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";

type GitHubIssueAssignee = {
  login: string;
  avatar_url?: string | null;
  html_url?: string;
};

type GitHubIssueReactions = {
  eyes?: number;
};

type GitHubIssue = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  created_at: string;
  updated_at: string;
  assignees?: GitHubIssueAssignee[];
  reactions?: GitHubIssueReactions;
};

type IssueType = "bug" | "feature" | "data";

type Props = {
  open: boolean;
  setOpenAction: Dispatch<SetStateAction<boolean>>;
};

export function IssueReportDialog({ open, setOpenAction }: Props) {
  const { t } = useT();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [duplicates, setDuplicates] = useState<GitHubIssue[]>([]);
  const [activeIssues, setActiveIssues] = useState<GitHubIssue[]>([]);
  const [isLoadingActiveIssues, setIsLoadingActiveIssues] = useState(false);
  const [, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [issueType, setIssueType] = useState<IssueType | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequestId = useRef(0);

  const contactEmail = t("tools.reportIssueDialog.contactEmail", {
    defaultValue: process.env.NEXT_PUBLIC_SUPPORT_MAIL || "support@example.com",
  });
  const isFormStep = issueType === "bug" || issueType === "feature";
  const isDataStep = issueType === "data";
  const isSelectionStep = issueType === null;

  const issueTypeOptions = [
    {
      type: "bug" as const,
      icon: "bug_report",
      title: t("tools.reportIssueDialog.choiceBugTitle", {
        defaultValue: "Bug",
      }),
      description: t("tools.reportIssueDialog.choiceBugDescription", {
        defaultValue: "Something isn't working as expected.",
      }),
    },
    {
      type: "feature" as const,
      icon: "lightbulb",
      title: t("tools.reportIssueDialog.choiceFeatureTitle", {
        defaultValue: "Feature request",
      }),
      description: t("tools.reportIssueDialog.choiceFeatureDescription", {
        defaultValue: "Suggest an improvement or a new capability.",
      }),
    },
    {
      type: "data" as const,
      icon: "database",
      title: t("tools.reportIssueDialog.choiceDataTitle", {
        defaultValue: "Data issue",
      }),
      description: t("tools.reportIssueDialog.choiceDataDescription", {
        defaultValue: "Missing price, product, customer, or similar data.",
      }),
    },
  ];
  const bugTemplate = t("tools.reportIssueDialog.templates.bug", {
    defaultValue:
      "**Describe the bug**\nA clear and concise description of what the bug is.\n\n**To Reproduce**\nSteps to reproduce the behavior:\n\n1. Go to '...'\n2. Click on '....'\n3. Scroll down to '....'\n4. See error\n\n**Expected behavior**\nA clear and concise description of what you expected to happen.\n\n**Desktop (please complete the following information):**\n\n- Browser [e.g. chrome, safari]\n- Version [e.g. 22]\n\n**Additional context**\nAdd any other context about the problem here.",
  });
  const featureTemplate = t("tools.reportIssueDialog.templates.feature", {
    defaultValue:
      "**Is your feature request related to a problem? Please describe.**\nA clear and concise description of what the problem is. Ex. I'm always frustrated when [...]\n\n**Describe the solution you'd like**\nA clear and concise description of what you want to happen.\n\n**Describe alternatives you've considered**\nA clear and concise description of any alternative solutions or features you've considered.\n\n**Additional context**\nAdd any other context or screenshots about the feature request here.",
  });

  useEffect(() => {
    if (!open || !isSelectionStep) {
      return;
    }

    let isActive = true;

    const fetchActiveIssues = async () => {
      setIsLoadingActiveIssues(true);
      try {
        const results = await listGitHubIssues();
        if (isActive) {
          setActiveIssues(results ?? []);
        }
      } catch (error) {
        console.error("Error loading active issues:", error);
        if (isActive) {
          setActiveIssues([]);
        }
      } finally {
        if (isActive) {
          setIsLoadingActiveIssues(false);
        }
      }
    };

    fetchActiveIssues();

    return () => {
      isActive = false;
    };
  }, [open, isSelectionStep]);

  useEffect(() => {
    if (!isFormStep) {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
      setDuplicates((prev) => (prev.length ? [] : prev));
      setIsSearching((prev) => (prev ? false : prev));
      return;
    }

    const trimmedTitle = title.trim();

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }

    if (trimmedTitle.length < 3) {
      searchRequestId.current += 1;
      setDuplicates((prev) => (prev.length ? [] : prev));
      setIsSearching((prev) => (prev ? false : prev));
      return;
    }

    const requestId = ++searchRequestId.current;
    setIsSearching(true);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await searchGitHubIssues(trimmedTitle);
        if (searchRequestId.current === requestId) {
          setDuplicates(results || []);
        }
      } catch (error) {
        console.error("Error searching for duplicates:", error);
      } finally {
        if (searchRequestId.current === requestId) {
          setIsSearching(false);
        }
      }
    }, 400);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
    };
  }, [title, isFormStep]);

  const handleTitleChange = (value: string) => {
    setTitle(value);
  };

  const resetForm = () => {
    setTitle("");
    setBody("");
    setDuplicates([]);
  };

  const handleIssueTypeSelect = (type: IssueType) => {
    resetForm();
    setIssueType(type);
    if (type === "bug") {
      setBody(bugTemplate);
    }
    if (type === "feature") {
      setBody(featureTemplate);
    }
  };

  const handleBackToTypes = () => {
    if (!isSubmitting) {
      setIssueType(null);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toaster.create({
        title: t("tools.reportIssueDialog.titleRequired", {
          defaultValue: "Title is required",
        }),
        type: "error",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const issue = await createGitHubIssue(title, body);
      if (issue) {
        toaster.create({
          title: t("tools.reportIssueDialog.success", {
            defaultValue: "Issue created successfully",
          }),
          description: t("tools.reportIssueDialog.successDescription", {
            defaultValue: "Thank you for your feedback!",
          }),
          type: "success",
        });
        // Reset form and close dialog
        resetForm();
        setIssueType(null);
        setOpenAction(false);
      } else {
        toaster.create({
          title: t("tools.reportIssueDialog.error", {
            defaultValue: "Failed to create issue",
          }),
          description: t("tools.reportIssueDialog.errorDescription", {
            defaultValue: "Please try again later",
          }),
          type: "error",
        });
      }
    } catch (error) {
      console.error("Error creating issue:", error);
      toaster.create({
        title: t("tools.reportIssueDialog.error", {
          defaultValue: "Failed to create issue",
        }),
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setIssueType(null);
      setOpenAction(false);
      // Reset form after dialog animation completes
      setTimeout(() => {
        resetForm();
      }, 300);
    }
  };

  return (
    <Dialog.Root
      size="lg"
      open={open}
      onOpenChange={({ open }) => !isSubmitting && setOpenAction(open)}
      motionPreset="slide-in-bottom"
      lazyMount
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.CloseTrigger asChild onClick={handleClose}>
              <CloseButton disabled={isSubmitting} />
            </Dialog.CloseTrigger>
            <Dialog.Header>
              <VStack align="stretch" gap={2}>
                {issueType && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBackToTypes}
                    alignSelf="flex-start"
                    disabled={isSubmitting}
                  >
                    <MaterialSymbol>arrow_back</MaterialSymbol>
                    {t("tools.reportIssueDialog.backToTypes", {
                      defaultValue: "Back",
                    })}
                  </Button>
                )}
                <Dialog.Title>
                  {isSelectionStep &&
                    t("tools.reportIssueDialog.choiceTitle", {
                      defaultValue: "What would you like to report?",
                    })}
                  {isFormStep &&
                    issueType === "bug" &&
                    t("tools.reportIssueDialog.formTitleBug", {
                      defaultValue: "Report a bug",
                    })}
                  {isFormStep &&
                    issueType === "feature" &&
                    t("tools.reportIssueDialog.formTitleFeature", {
                      defaultValue: "Request a feature",
                    })}
                  {isDataStep &&
                    t("tools.reportIssueDialog.dataTitle", {
                      defaultValue: "Data issue",
                    })}
                </Dialog.Title>
                {isSelectionStep && (
                  <Text color="gray.600">
                    {t("tools.reportIssueDialog.choiceDescription", {
                      defaultValue:
                        "Choose the option that best matches your issue.",
                    })}
                  </Text>
                )}
                {isDataStep && (
                  <Text color="gray.600">
                    {t("tools.reportIssueDialog.dataDescription", {
                      defaultValue:
                        "Data-related issues are handled by our team directly.",
                    })}
                  </Text>
                )}
              </VStack>
            </Dialog.Header>
            <Dialog.Body>
              {isSelectionStep && (
                <VStack gap={6} align="stretch">
                  <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
                    {issueTypeOptions.map((option) => (
                      <Card.Root
                        key={option.type}
                        borderRadius="2xl"
                        borderWidth="1px"
                        borderColor="gray.muted"
                        _hover={{
                          borderColor: "primary.400",
                          cursor: "pointer",
                        }}
                        transition="border-color 0.2s"
                        onClick={() => handleIssueTypeSelect(option.type)}
                      >
                        <Card.Body p={4}>
                          <HStack align="start" gap={3}>
                            <MaterialSymbol>{option.icon}</MaterialSymbol>
                            <VStack align="start" gap={1}>
                              <Text fontWeight="semibold">{option.title}</Text>
                              <Text color="gray.600" fontSize="sm">
                                {option.description}
                              </Text>
                            </VStack>
                          </HStack>
                        </Card.Body>
                      </Card.Root>
                    ))}
                  </SimpleGrid>

                  <VStack align="stretch" gap={3}>
                    <Text fontWeight="semibold">
                      {t("tools.reportIssueDialog.activeIssuesTitle", {
                        defaultValue: "Active issues",
                      })}
                    </Text>
                    {isLoadingActiveIssues ? (
                      <Text color="gray.600">
                        {t("tools.reportIssueDialog.activeIssuesLoading", {
                          defaultValue: "Loading active issues...",
                        })}
                      </Text>
                    ) : activeIssues.length > 0 ? (
                      <VStack align="stretch" gap={3}>
                        {activeIssues.map((issue) => {
                          const statusLabel =
                            issue.state === "open"
                              ? t("tools.reportIssueDialog.issueStatusOpen", {
                                  defaultValue: "Open",
                                })
                              : t("tools.reportIssueDialog.issueStatusClosed", {
                                  defaultValue: "Closed",
                                });
                          const statusPalette =
                            issue.state === "open" ? "green" : "gray";
                          const hasWorkedOn = (issue.reactions?.eyes ?? 0) > 0;
                          const assignees = issue.assignees ?? [];
                          const updatedDate = new Date(
                            issue.updated_at,
                          ).toLocaleDateString();

                          return (
                            <Card.Root
                              key={issue.id}
                              borderRadius="2xl"
                              borderWidth="1px"
                              borderColor="gray.muted"
                            >
                              <Card.Body p={3}>
                                <HStack
                                  align="start"
                                  justify="space-between"
                                  gap={3}
                                >
                                  <VStack align="start" gap={1} flex="1">
                                    <Link
                                      href={issue.html_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      color="primary.solid"
                                      fontWeight="semibold"
                                      lineClamp={1}
                                      _hover={{ textDecoration: "underline" }}
                                    >
                                      #{issue.number} · {issue.title}
                                    </Link>
                                    <HStack
                                      gap={3}
                                      color="gray.600"
                                      fontSize="sm"
                                      flexWrap="wrap"
                                    >
                                      <Text>
                                        {t(
                                          "tools.reportIssueDialog.activeIssueUpdated",
                                          {
                                            defaultValue: "Updated {{date}}",
                                            date: updatedDate,
                                          },
                                        )}
                                      </Text>
                                      {hasWorkedOn && (
                                        <HStack
                                          gap={1}
                                          color="primaryAccent.600"
                                        >
                                          <MaterialSymbol>
                                            visibility
                                          </MaterialSymbol>
                                          <Text>
                                            {t(
                                              "tools.reportIssueDialog.activeIssueWorkedOn",
                                              {
                                                defaultValue: "Worked on",
                                              },
                                            )}
                                          </Text>
                                        </HStack>
                                      )}
                                    </HStack>
                                    {assignees.length > 0 && (
                                      <HStack gap={2} flexWrap="wrap">
                                        <Text color="gray.600" fontSize="xs">
                                          {t(
                                            "tools.reportIssueDialog.activeIssueAssignees",
                                            {
                                              defaultValue: "Assignees",
                                            },
                                          )}
                                        </Text>
                                        <HStack gap={1} align="center">
                                          {assignees.map((assignee) => (
                                            <Avatar.Root
                                              key={assignee.login}
                                              size="2xs"
                                            >
                                              {assignee.avatar_url && (
                                                <Avatar.Image
                                                  src={assignee.avatar_url}
                                                />
                                              )}
                                              <Avatar.Fallback
                                                name={assignee.login}
                                              />
                                            </Avatar.Root>
                                          ))}
                                        </HStack>
                                      </HStack>
                                    )}
                                  </VStack>
                                  <Badge
                                    colorPalette={statusPalette}
                                    alignSelf="flex-start"
                                  >
                                    {statusLabel}
                                  </Badge>
                                </HStack>
                              </Card.Body>
                            </Card.Root>
                          );
                        })}
                      </VStack>
                    ) : (
                      <Text color="gray.600">
                        {t("tools.reportIssueDialog.activeIssuesEmpty", {
                          defaultValue: "No active issues yet.",
                        })}
                      </Text>
                    )}
                  </VStack>
                </VStack>
              )}

              {isDataStep && (
                <Alert.Root
                  colorPalette="primary"
                  borderStartWidth="4px"
                  borderStartColor="primary.solid"
                >
                  <Alert.Indicator>
                    <MaterialSymbol>mail</MaterialSymbol>
                  </Alert.Indicator>
                  <Alert.Content>
                    <Alert.Title>
                      {t("tools.reportIssueDialog.dataContactTitle", {
                        defaultValue: "Contact email",
                      })}
                    </Alert.Title>
                    <Alert.Description>
                      <Text>
                        {t("tools.reportIssueDialog.dataContactDescription", {
                          defaultValue: "For data issues, please contact us at",
                        })}{" "}
                        <Link
                          href={`mailto:${contactEmail}`}
                          color="primary.solid"
                          _hover={{ textDecoration: "underline" }}
                        >
                          {contactEmail}
                        </Link>
                      </Text>
                    </Alert.Description>
                  </Alert.Content>
                </Alert.Root>
              )}

              {isFormStep && (
                <VStack gap={4} align="stretch">
                  <Field.Root required>
                    <Field.Label>
                      {t("tools.reportIssueDialog.issueTitle", {
                        defaultValue: "Issue Title",
                      })}
                    </Field.Label>
                    <Textarea
                      value={title}
                      onChange={(e) => handleTitleChange(e.target.value)}
                      placeholder={t(
                        "tools.reportIssueDialog.titlePlaceholder",
                        {
                          defaultValue: "Brief description of the issue…",
                        },
                      )}
                      disabled={isSubmitting}
                      borderRadius="3xl"
                      rows={2}
                    />
                    <Field.HelperText>
                      {t("tools.reportIssueDialog.titleHelper", {
                        defaultValue:
                          "A clear and concise title helps us understand the issue better",
                      })}
                    </Field.HelperText>
                  </Field.Root>

                  {duplicates.length > 0 && (
                    <Alert.Root
                      colorPalette="yellow"
                      borderStartWidth="4px"
                      borderStartColor="yellow.solid"
                    >
                      <Alert.Indicator>
                        <MaterialSymbol>info</MaterialSymbol>
                      </Alert.Indicator>
                      <Alert.Content>
                        <Alert.Title>
                          {t("tools.reportIssueDialog.duplicatesFound", {
                            defaultValue: "Potential duplicate issues found",
                          })}
                        </Alert.Title>
                        <Alert.Description>
                          <Text mb={2}>
                            {t(
                              "tools.reportIssueDialog.duplicatesDescription",
                              {
                                defaultValue:
                                  "Please check if your issue already exists:",
                              },
                            )}
                          </Text>
                          <VStack gap={1} align="stretch">
                            {duplicates.map((issue) => (
                              <Link
                                key={issue.id}
                                href={issue.html_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                color="primary.solid"
                                fontSize="sm"
                                _hover={{ textDecoration: "underline" }}
                              >
                                #{issue.number}: {issue.title}
                              </Link>
                            ))}
                          </VStack>
                        </Alert.Description>
                      </Alert.Content>
                    </Alert.Root>
                  )}

                  <Field.Root>
                    <Field.Label>
                      {t("common.description", { defaultValue: "Description" })}
                    </Field.Label>
                    <Textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder={t(
                        "tools.reportIssueDialog.bodyPlaceholder",
                        {
                          defaultValue:
                            "Detailed description, steps to reproduce, expected behavior…",
                        },
                      )}
                      disabled={isSubmitting}
                      borderRadius="3xl"
                      rows={8}
                    />
                    <Field.HelperText>
                      {t("tools.reportIssueDialog.bodyHelper", {
                        defaultValue:
                          "Provide as much detail as possible to help us resolve the issue",
                      })}
                    </Field.HelperText>
                  </Field.Root>
                </VStack>
              )}
            </Dialog.Body>
            {isFormStep && (
              <Dialog.Footer>
                <Button
                  variant="outline"
                  onClick={handleClose}
                  disabled={isSubmitting}
                >
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </Button>
                <Button
                  onClick={handleSubmit}
                  loading={isSubmitting}
                  disabled={isSubmitting || !title.trim()}
                  colorPalette="primary"
                >
                  {t("tools.reportIssueDialog.submit", {
                    defaultValue: "Submit Issue",
                  })}
                </Button>
              </Dialog.Footer>
            )}
            {isDataStep && (
              <Dialog.Footer>
                <Button variant="outline" onClick={handleClose}>
                  {t("common.close", { defaultValue: "Close" })}
                </Button>
              </Dialog.Footer>
            )}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
