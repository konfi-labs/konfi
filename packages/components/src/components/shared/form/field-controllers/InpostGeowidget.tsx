"use client";

import { Box } from "@chakra-ui/react";
import Head from "next/head";
import Script from "next/script";
import {
  forwardRef,
  createContext,
  HTMLAttributes,
  ReactNode,
  useContext,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export type InpostGeowidget = Omit<
  InpostApiMethods,
  "addPointSelectedCallback"
>;

const InpostGeowidgetTokenContext = createContext<string | undefined>(
  undefined,
);

export function InpostGeowidgetTokenProvider({
  children,
  token,
}: {
  children: ReactNode;
  token?: string;
}) {
  return (
    <InpostGeowidgetTokenContext.Provider value={token}>
      {children}
    </InpostGeowidgetTokenContext.Provider>
  );
}

export function useInpostGeowidgetToken() {
  return useContext(InpostGeowidgetTokenContext);
}

/**
 * InpostGeowidget is a React component that renders the Inpost GeoWidget.
 *
 * @param token {token} string - Inpost token for authentication which you can generate in the Inpost Package Manager page.
 * @param language {language} string - Default language of the widget. It can be "pl", "en" or "uk".
 * @param config {config} string - Configuration of the widget. It can be "parcelCollect", "parcelCollectPayment", "parcelCollect247" or "parcelSend".
 * @param containerProps {containerProps} React.HTMLAttributes<HTMLDivElement> - Additional props for the container element.
 * @param onPoint {onPoint} function - Callback function that is called when a point is selected.
 **/
export const InpostGeowidget = forwardRef<
  InpostGeowidget,
  InpostGeowidgetProps
>(
  (
    {
      token,
      language = "pl",
      config = "parcelCollect",
      containerProps,
      onPoint,
      ...rest
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const _api = useRef<InpostGeowidget | undefined>(undefined);
    const [isScriptLoaded, setIsScriptLoaded] = useState(false);

    const { className: containerPropsClassName, ...containerPropsRest } =
      containerProps ?? {};

    const initGeowidget = useCallback(
      function initGeowidget(evt: CustomEvent<InpostInternalApi>) {
        const api = evt.detail.api;
        _api.current = api;
        if (onPoint) {
          api.addPointSelectedCallback(onPoint);
        }
      },
      [onPoint],
    );

    useEffect(() => {
      // Check if script is already loaded
      const scriptLoaded = document.querySelector(
        'script[src*="inpost-geowidget.js"]',
      );
      if (scriptLoaded) {
        setIsScriptLoaded(true);
      }
    }, []);

    useEffect(() => {
      if (!isScriptLoaded || !containerRef.current) return;

      const container = containerRef.current;

      // Create widget element
      const widget = document.createElement("inpost-geowidget");
      widget.setAttribute("token", token);
      widget.setAttribute("language", language);
      widget.setAttribute("config", config);

      // Add any additional attributes from rest props
      Object.entries(rest).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          widget.setAttribute(key, String(value));
        }
      });

      // Add event listener before appending
      widget.addEventListener(
        "inpost.geowidget.init",
        initGeowidget as EventListener,
      );

      // Append widget to container
      container.appendChild(widget);

      // Cleanup function
      return () => {
        widget.removeEventListener(
          "inpost.geowidget.init",
          initGeowidget as EventListener,
        );
        if (container.contains(widget)) {
          container.removeChild(widget);
        }
        _api.current = undefined;
      };
    }, [token, language, config, isScriptLoaded, initGeowidget, rest]);

    useImperativeHandle(
      ref,
      () => ({
        changeLanguage: (lang) => {
          _api.current?.changeLanguage(lang);
        },
        changePointsType: (type) => {
          _api.current?.changePointsType(type);
        },
        changePosition: (position, zoom) => {
          _api.current?.changePosition(position, zoom);
        },
        changeZoomLevel: (zoom) => {
          _api.current?.changeZoomLevel(zoom);
        },
        clearSearch: () => {
          _api.current?.clearSearch();
        },
        hideSearchResults: () => {
          _api.current?.hideSearchResults();
        },
        search: (query) => {
          _api.current?.search(query);
        },
        selectPoint: (name) => {
          _api.current?.selectPoint(name);
        },
        showPoint: (name) => {
          _api.current?.showPoint(name);
        },
        showPointDetails: (name) => {
          _api.current?.showPointDetails(name);
        },
      }),
      [],
    );

    return (
      <>
        <Head>
          <link
            rel="stylesheet"
            href={
              process.env.NODE_ENV === "development"
                ? "https://sandbox-easy-geowidget-sdk.easypack24.net/inpost-geowidget.css"
                : "https://geowidget.inpost.pl/inpost-geowidget.css"
            }
            key="inpost-geowidget-css"
          />
        </Head>
        <Script
          src={
            process.env.NODE_ENV === "development"
              ? "https://sandbox-easy-geowidget-sdk.easypack24.net/inpost-geowidget.js"
              : "https://geowidget.inpost.pl/inpost-geowidget.js"
          }
          defer
          onLoad={() => setIsScriptLoaded(true)}
        />
        <Box
          ref={containerRef}
          className={containerPropsClassName}
          {...containerPropsRest}
          h={"600px"}
          minW={0}
          w={"100%"}
          css={{
            "& inpost-geowidget": {
              display: "block",
              width: "100%",
            },
          }}
        />
      </>
    );
  },
);

InpostGeowidget.displayName = "InpostGeowidget";

/**
 * Represents a point in the Inpost Geowidget.
 *
 * @property {Address} address - The address of the point.
 * @property {AddressDetails} address_details - Additional address details.
 * @property {string} apm_doubled - Information related to APM doubling.
 * @property {boolean} [easy_access_zone] - Whether the point is in an easy access zone.
 * @property {string} image_url - URL of the image for the point.
 * @property {Location} location - The geographical location of the point.
 * @property {boolean} location_24 - Indicates if the point is accessible 24/7.
 * @property {string} location_description - Description of the location.
 * @property {string} name - The name of the point.
 * @property {string} opening_hours - The opening hours of the point.
 * @property {OperatingHoursExtended} operating_hours_extended - Extended operating hours information.
 * @property {number} partner_id - The partner ID associated with the point.
 * @property {string} payment_point_descr - Description of the payment point.
 * @property {Object.<number, string>} payment_type - Payment types available, where the key is the payment type ID.
 * @property {string} [payment_type.2] - Optional specific payment type information for ID 2.
 * @property {string} physical_type_description - Description of the physical type of the point.
 * @property {string} physical_type_mapped - Mapped physical type description.
 * @property {string[]} recommended_low_interest_box_machines_list - List of recommended low-interest box machines.
 * @property {"parcel_locker" | "parcel_locker_superpop" | "pop"} type - The type of the point (e.g., parcel locker).
 * @property {string} virtual - Virtual point information.
 */
export interface InpostGeowidgetPoint {
  address: InpostAddress;
  address_details: InpostAddressDetails;
  apm_doubled: string;
  easy_access_zone?: boolean;
  image_url: string;
  location: Location;
  location_24: boolean;
  location_description: string;
  name: string;
  opening_hours: string;
  operating_hours_extended: InpostOperatingHoursExtended;
  partner_id: number;
  payment_point_descr: string;
  payment_type: {
    2?: string;
  };
  physical_type_description: string;
  physical_type_mapped: string;
  recommended_low_interest_box_machines_list: string[];
  type: "parcel_locker" | "parcel_locker_superpop" | "pop";
  virtual: string;
}

export interface InpostGeowidgetProps extends HTMLAttributes<HTMLDivElement> {
  token: string;
  language?: InpostLanguage;
  config?: InpostConfig;

  containerProps?: HTMLAttributes<HTMLDivElement>;
  onPoint: (point: InpostGeowidgetPoint) => void;
}

/**
 * Represents the language options for the widget.
 */
export type InpostLanguage = "pl" | "en" | "uk";

/**
 * Represents the configuration options for the widget.
 *
 * @property parcelCollect - Option to configure the widget for parcel collection only.
 * @property parcelCollectPayment - Option to configure the widget for parcel collection with payment options.
 * @property parcelCollect247 - Option to configure the widget for 24/7 parcel collection.
 * @property parcelSend - Option to configure the widget for sending parcels.
 */
export type InpostConfig =
  | "parcelCollect"
  | "parcelCollectPayment"
  | "parcelCollect247"
  | "parcelSend";

/**
 * Represents address information.
 * @property line1 - First line of the address.
 * @property line2 - Second line of the address.
 */
export type InpostAddress = {
  line1: string;
  line2: string;
};

/**
 * Additional details for the address.
 * @property building_number - The building number.
 * @property city - The city name.
 * @property flat_number - The flat number.
 * @property post_code - The postal code.
 * @property province - The province.
 * @property street - The street name.
 */
export type InpostAddressDetails = {
  building_number: string;
  city: string;
  flat_number: string;
  post_code: string;
  province: string;
  street: string;
};

/**
 * Represents filter points in the widget.
 */
export type InpostFilterPoints = "ALL" | "PARCEL_LOCKER" | "POP";

/**
 * Represents the geographical location of a point.
 * @property latitude - The latitude of the point.
 * @property longitude - The longitude of the point.
 * @property distance - The distance to the point.
 */
export type InpostLocation = {
  distance?: number;
  latitude: number;
  longitude: number;
};

/**
 * Range of opened hours.
 * @property start - Start time of the operating hours.
 * @property end - End time of the operating hours.
 */
export type InpostOpenedHoursRange = {
  end: number;
  start: number;
};

/**
 * Extended operating hours.
 * @property customer.monday - Operating hours for Monday.
 * @property customer.tuesday - Operating hours for Tuesday.
 * @property customer.wednesday - Operating hours for Wednesday.
 * @property customer.thursday - Operating hours for Thursday.
 * @property customer.friday - Operating hours for Friday.
 * @property customer.saturday - Operating hours for Saturday.
 * @property customer.sunday - Operating hours for Sunday.
 */
export type InpostOperatingHoursExtended = {
  customer?: {
    monday: InpostOpenedHoursRange;
    tuesday: InpostOpenedHoursRange;
    wednesday: InpostOpenedHoursRange;
    thursday: InpostOpenedHoursRange;
    friday: InpostOpenedHoursRange;
    saturday: InpostOpenedHoursRange;
    sunday: InpostOpenedHoursRange;
  };
};

interface InpostInternalApi {
  api: InpostApiMethods;
}

/**
 * Represents the API methods of the Inpost GeoWidget.
 * @property addPointSelectedCallback - Adds a callback function that is called when a point is selected.
 * @property changeLanguage - Changes the language of the widget.
 * @property changePointsType - Changes the type of points displayed in the widget.
 * @property changePosition - Changes the position of the widget.
 * @property changeZoomLevel - Changes the zoom level of the widget.
 * @property clearSearch - Clears the search results.
 * @property hideSearchResults - Hides the search results.
 * @property search - Performs a search.
 * @property selectPoint - Selects a point.
 * @property showPoint - Shows a point.
 * @property showPointDetails - Shows the details of a point.
 */
interface InpostApiMethods {
  addPointSelectedCallback: (
    callback: (point: InpostGeowidgetPoint) => void,
  ) => void;
  changeLanguage: (lang: InpostLanguage) => void;
  changePointsType: (type: InpostFilterPoints) => void;
  changePosition: (position: InpostLocation, zoom?: number) => void;
  changeZoomLevel: (zoom: number) => void;
  clearSearch: () => void;
  hideSearchResults: () => void;
  search: (query: string) => void;
  selectPoint: (name: string) => void;
  showPoint: (name: string) => void;
  showPointDetails: (name: string) => void;
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "inpost-geowidget": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          token: string;
          language: InpostLanguage;
          config: InpostConfig;
        },
        HTMLElement
      >;
    }
  }

  interface GlobalEventHandlersMap {
    onPoint: CustomEvent<InpostGeowidgetPoint>;
  }
}
