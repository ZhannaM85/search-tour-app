export type HotelNote = {
  id: string;
  hotelId: number | null;
  name: string;
  pageUrl: string;
  photoUrl: string;
  latitude: number;
  longitude: number;
  priceOneRoom: string;
  priceTwoRooms: string;
  priceThreeRooms: string;
  /** Tour operator for the 1-room price offer (auto-filled or manual). */
  operatorOneRoom: string;
  /** Tour operator for the 2-room price offer (auto-filled or manual). */
  operatorTwoRooms: string;
  /** Tour operator for the 3-room price offer (auto-filled or manual). */
  operatorThreeRooms: string;
  notes: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ParsedTourCurl = {
  requestUrl: string;
  hotelId: number | null;
  name: string;
  pageUrl: string;
  photoUrl: string;
  latitude: number;
  longitude: number;
  refererUrl: string;
};
