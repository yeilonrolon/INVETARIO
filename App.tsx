import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type ScrollViewInstance,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  createProduct,
  createSale,
  deleteProduct,
  getPendingSales,
  getSalesHistory,
  getExchangeRate,
  getProducts,
  confirmSale as confirmPendingSale,
  cancelSale as cancelPendingSale,
  updateExchangeRate,
  updateProduct,
  verifyInventoryPassword,
  verifyRatePassword,
} from './src/services/products';
import type { ExchangeRate } from './src/types/exchange-rate';
import type { Product } from './src/types/product';
import type {
  PendingSale,
  SaleCurrency,
  SaleHistoryRecord,
} from './src/types/sale';

type SaleLine = {
  product: Product;
  quantity: number;
};

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const pesoNumberFormatter = new Intl.NumberFormat('es-CO', {
  maximumFractionDigits: 0,
});

const bolivarFormatter = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dollarFormatter = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatSaleAmount(amount: number, currency: SaleCurrency): string {
  if (currency === 'VES') return `Bs. ${bolivarFormatter.format(amount)}`;
  if (currency === 'USD') return `$ ${dollarFormatter.format(amount)}`;
  return currencyFormatter.format(amount);
}

function roundSaleAmount(amount: number, currency: SaleCurrency): number {
  const multiplier = 10 ** (currency === 'USD' ? 1 : currency === 'VES' ? 2 : 0);
  return Math.round((amount + Number.EPSILON) * multiplier) / multiplier;
}

function formatProductPrices(
  priceInPesos: number,
  exchangeRate: ExchangeRate | null,
): string {
  const dollars = exchangeRate
    ? formatSaleAmount(
        roundSaleAmount(priceInPesos / exchangeRate.cambio_dolares, 'USD'),
        'USD',
      )
    : '$ —';
  const bolivares = exchangeRate
    ? formatSaleAmount(
        roundSaleAmount(priceInPesos / exchangeRate.cambio_bs, 'VES'),
        'VES',
      )
    : 'Bs. —';

  return `COP ${pesoNumberFormatter.format(roundSaleAmount(priceInPesos, 'COP'))}  ·  ${dollars}  ·  ${bolivares}`;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SaleScreen />
    </SafeAreaProvider>
  );
}

function SaleScreen() {
  const { width } = useWindowDimensions();
  const compactScreen = width <= 360;
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null);
  const [exchangeRateError, setExchangeRateError] = useState<string | null>(null);
  const [saleLines, setSaleLines] = useState<SaleLine[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [enteredPassword, setEnteredPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [settingsPassword, setSettingsPassword] = useState<string | null>(null);
  const [showRateSettings, setShowRateSettings] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showPendingSales, setShowPendingSales] = useState(false);
  const [showSalesHistory, setShowSalesHistory] = useState(false);
  const [saleSubmitting, setSaleSubmitting] = useState(false);
  const [currencyDialogOpen, setCurrencyDialogOpen] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<SaleCurrency>('COP');
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const [saleConfirmationMessage, setSaleConfirmationMessage] = useState<
    string | null
  >(null);
  const scrollRef = useRef<ScrollViewInstance | null>(null);

  const canGoBack =
    showRateSettings ||
    showAddProduct ||
    showInventory ||
    showPendingSales ||
    showSalesHistory;

  const goBack = useCallback(() => {
    if (currencyDialogOpen) {
      if (!saleSubmitting) setCurrencyDialogOpen(false);
      return true;
    }
    if (passwordDialogOpen) {
      if (!verifyingPassword) setPasswordDialogOpen(false);
      return true;
    }
    if (showRateSettings) {
      setShowRateSettings(false);
      setSettingsPassword(null);
      return true;
    }
    if (showInventory) {
      setShowInventory(false);
      setShowAddProduct(true);
      return true;
    }
    if (showAddProduct) {
      setShowAddProduct(false);
      return true;
    }
    if (showPendingSales) {
      setShowPendingSales(false);
      return true;
    }
    if (showSalesHistory) {
      setShowSalesHistory(false);
      return true;
    }
    if (menuOpen) {
      setMenuOpen(false);
      return true;
    }
    return false;
  }, [
    currencyDialogOpen,
    menuOpen,
    passwordDialogOpen,
    saleSubmitting,
    showAddProduct,
    showInventory,
    showPendingSales,
    showRateSettings,
    showSalesHistory,
    verifyingPassword,
  ]);

  const backSwipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (event, gestureState) =>
          canGoBack &&
          event.nativeEvent.pageX <= 28 &&
          gestureState.dx > 12 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.3 &&
          !currencyDialogOpen &&
          !passwordDialogOpen,
        onPanResponderRelease: (_event, gestureState) => {
          if (
            gestureState.dx >= 80 &&
            gestureState.dx > Math.abs(gestureState.dy) * 1.3
          ) {
            goBack();
          }
        },
      }),
    [
      canGoBack,
      currencyDialogOpen,
      goBack,
      passwordDialogOpen,
    ],
  );

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      goBack,
    );
    return () => subscription.remove();
  }, [goBack]);

  const withBackSwipe = (screen: React.ReactNode) => (
    <View style={styles.navigationContainer}>
      {screen}
      {canGoBack && (
        <View
          {...backSwipeResponder.panHandlers}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.backSwipeEdge}
        />
      )}
    </View>
  );

  useEffect(() => {
    let active = true;

    getProducts()
      .then((loadedProducts) => {
        if (active) setProducts(loadedProducts);
      })
      .catch((error: unknown) => {
        if (active) {
          setProductsError(
            error instanceof Error ? error.message : 'Error cargando productos.',
          );
        }
      })
      .finally(() => {
        if (active) setProductsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    getExchangeRate()
      .then((rate) => {
        if (active) setExchangeRate(rate);
      })
      .catch((error: unknown) => {
        if (active) {
          setExchangeRateError(
            error instanceof Error ? error.message : 'Error cargando tasas.',
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return products.filter((product) => {
      const alreadyAdded = saleLines.some((line) => line.product.id === product.id);
      return !alreadyAdded && product.descripcion.toLocaleLowerCase().includes(query);
    });
  }, [products, saleLines, search]);

  const addProduct = (product: Product) => {
    setSaleLines((current) => [...current, { product, quantity: 1 }]);
    setSearch('');
    setSaleConfirmationMessage(null);
  };

  const changeQuantity = (productId: number, amount: number) => {
    setSaleLines((current) =>
      current
        .map((line) =>
          line.product.id === productId
            ? { ...line, quantity: line.quantity + amount }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  };

  const totalPesos = saleLines.reduce(
    (total, line) => total + line.product.precio_pesos * line.quantity,
    0,
  );
  const totalBolivares = exchangeRate
    ? totalPesos / exchangeRate.cambio_bs
    : null;
  const totalDolares = exchangeRate
    ? totalPesos / exchangeRate.cambio_dolares
    : null;

  const openCurrencyDialog = () => {
    if (saleLines.length === 0) return;
    setSelectedCurrency('COP');
    setCurrencyError(null);
    setProductsError(null);
    setCurrencyDialogOpen(true);
  };

  const confirmSale = async () => {
    if (saleLines.length === 0) return;
    if (selectedCurrency !== 'COP' && !exchangeRate) {
      setCurrencyError(
        exchangeRateError ?? 'No se pudieron cargar las tasas de cambio.',
      );
      return;
    }

    setSaleSubmitting(true);
    setSaleConfirmationMessage(null);
    setCurrencyError(null);
    setProductsError(null);
    try {
      await createSale(
        saleLines.map((line) => ({
          producto_id: line.product.id,
          cantidad: line.quantity,
        })),
        selectedCurrency,
      );
      setSaleLines([]);
      setSearch('');
      setCurrencyDialogOpen(false);
      setSaleConfirmationMessage(
        `Venta registrada en ${selectedCurrency === 'VES' ? 'bolívares' : selectedCurrency === 'USD' ? 'dólares' : 'pesos'} y pendiente de confirmación.`,
      );
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo registrar la venta.';
      setCurrencyError(message);
      setProductsError(message);
    } finally {
      setSaleSubmitting(false);
    }
  };

  const currencyPreviewTotal = (currency: SaleCurrency) =>
    saleLines.reduce((total, line) => {
      let unitPrice = line.product.precio_pesos;
      if (currency === 'VES' && exchangeRate) {
        unitPrice /= exchangeRate.cambio_bs;
      } else if (currency === 'USD' && exchangeRate) {
        unitPrice /= exchangeRate.cambio_dolares;
      }
      return total + roundSaleAmount(unitPrice, currency) * line.quantity;
    }, 0);

  const openRatePassword = () => {
    setMenuOpen(false);
    setEnteredPassword('');
    setPasswordError(null);
    setPasswordDialogOpen(true);
  };

  const enterRateSettings = async () => {
    setVerifyingPassword(true);
    setPasswordError(null);
    try {
      await verifyRatePassword(enteredPassword);
      setSettingsPassword(enteredPassword);
      setPasswordDialogOpen(false);
      setShowRateSettings(true);
    } catch (error) {
      setPasswordError(
        error instanceof Error ? error.message : 'No se pudo validar la clave.',
      );
    } finally {
      setVerifyingPassword(false);
    }
  };

  if (showRateSettings) {
    return withBackSwipe(
      <RateSettingsScreen
        initialRate={exchangeRate}
        password={settingsPassword ?? ''}
        onBack={() => {
          setShowRateSettings(false);
          setSettingsPassword(null);
        }}
        onSaved={(rate) => {
          setExchangeRate(rate);
          setExchangeRateError(null);
        }}
      />,
    );
  }

  if (showAddProduct) {
    return withBackSwipe(
      <AddProductScreen
        onBack={() => setShowAddProduct(false)}
        onViewInventory={() => {
          setShowAddProduct(false);
          setShowInventory(true);
        }}
        onCreated={(product) => {
          setProducts((current) =>
            [...current, product].sort((a, b) =>
              a.descripcion.localeCompare(b.descripcion),
            ),
          );
          setProductsError(null);
          setShowAddProduct(false);
        }}
      />,
    );
  }

  if (showInventory) {
    return withBackSwipe(
      <InventoryScreen
        onBack={() => {
          setShowInventory(false);
          setShowAddProduct(true);
        }}
        onProductUpdated={(updatedProduct) => {
          setProducts((current) =>
            current.map((product) =>
              product.id === updatedProduct.id ? updatedProduct : product,
            ),
          );
          setSaleLines((current) =>
            current.map((line) =>
              line.product.id === updatedProduct.id
                ? { ...line, product: updatedProduct }
                : line,
            ),
          );
        }}
        onProductDeleted={(productId) => {
          setProducts((current) =>
            current.filter((product) => product.id !== productId),
          );
          setSaleLines((current) =>
            current.filter((line) => line.product.id !== productId),
          );
        }}
      />,
    );
  }

  if (showPendingSales) {
    return withBackSwipe(
      <PendingSalesScreen
        onBack={() => setShowPendingSales(false)}
        onSaleConfirmed={async () => {
          try {
            const updatedProducts = await getProducts();
            setProducts(updatedProducts);
            setProductsError(null);
          } catch (error) {
            setProductsError(
              error instanceof Error
                ? error.message
                : 'No se pudo actualizar el inventario.',
            );
          }
        }}
      />,
    );
  }

  if (showSalesHistory) {
    return withBackSwipe(
      <SalesHistoryScreen onBack={() => setShowSalesHistory(false)} />,
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.container,
          compactScreen && styles.compactContainer,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>INVENTARIO</Text>
            <Text style={[styles.title, compactScreen && styles.compactTitle]}>
              Nueva venta
            </Text>
            <Text style={styles.subtitle}>Agrega productos a la venta</Text>
          </View>
        </View>
        {saleConfirmationMessage && (
          <View style={styles.saleConfirmationBanner}>
            <Text style={styles.saleConfirmationText}>
              {saleConfirmationMessage}
            </Text>
          </View>
        )}

        <View style={styles.searchCard}>
          <Text style={styles.fieldLabel}>BUSCAR PRODUCTO</Text>
          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              accessibilityLabel="Buscar un producto para agregar a la venta"
              placeholder="Escribe el nombre del producto..."
              placeholderTextColor="#97A1AF"
              value={search}
              onChangeText={setSearch}
              style={styles.searchInput}
              returnKeyType="search"
            />
          </View>
          <View style={styles.suggestions}>
            {productsLoading && (
              <ActivityIndicator color="#19866A" style={styles.suggestionsLoading} />
            )}
            {!productsLoading && productsError && (
              <Text style={styles.noSuggestions}>{productsError}</Text>
            )}
            {filteredProducts.slice(0, 3).map((product) => (
              <Pressable
                accessibilityRole="button"
                key={product.id}
                onPress={() => addProduct(product)}
                style={({ pressed }) => [
                  styles.suggestion,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.suggestionPlus}>
                  <Text style={styles.suggestionPlusText}>+</Text>
                </View>
                <View style={styles.suggestionInfo}>
                  <Text style={styles.suggestionName}>{product.descripcion}</Text>
                  <Text style={styles.suggestionPrice}>
                    {formatProductPrices(product.precio_pesos, exchangeRate)}
                  </Text>
                </View>
                <Text style={styles.suggestionAction}>Agregar</Text>
              </Pressable>
            ))}
            {!productsLoading &&
              !productsError &&
              filteredProducts.length === 0 && (
              <Text style={styles.noSuggestions}>
                {products.length === 0
                  ? 'No hay productos registrados en la base de datos.'
                  : search.trim()
                    ? 'No se encontraron productos.'
                    : 'Ya agregaste todos los productos disponibles.'}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>Productos de la venta</Text>
            <Text style={styles.sectionSubtitle}>
              {saleLines.length} {saleLines.length === 1 ? 'producto' : 'productos'} seleccionados
            </Text>
          </View>
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>
              {saleLines.reduce((count, line) => count + line.quantity, 0)} uds.
            </Text>
          </View>
        </View>

        {saleLines.length > 0 ? (
          <View style={styles.saleList}>
            {saleLines.map((line, index) => (
              <View
                key={line.product.id}
                style={[
                  styles.saleLine,
                  index < saleLines.length - 1 && styles.saleLineBorder,
                ]}
              >
                <View style={styles.productMark}>
                  <Text style={styles.productMarkText}>
                    {line.product.descripcion.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.productInfo}>
                  <Text style={styles.productName}>{line.product.descripcion}</Text>
                  <Text style={styles.productPrice}>
                    {formatProductPrices(line.product.precio_pesos, exchangeRate)}
                  </Text>
                </View>
                <View style={styles.quantityControls}>
                  <Pressable
                    accessibilityLabel={`Quitar una unidad de ${line.product.descripcion}`}
                    accessibilityRole="button"
                    onPress={() => changeQuantity(line.product.id, -1)}
                    style={({ pressed }) => [
                      styles.quantityButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.quantityButtonText}>−</Text>
                  </Pressable>
                  <Text style={styles.quantityValue}>{line.quantity}</Text>
                  <Pressable
                    accessibilityLabel={`Agregar una unidad de ${line.product.descripcion}`}
                    accessibilityRole="button"
                    onPress={() => changeQuantity(line.product.id, 1)}
                    style={({ pressed }) => [
                      styles.quantityButton,
                      styles.addQuantityButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.addQuantityButtonText}>+</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyCart}>
            <Text style={styles.emptyCartText}>
              Busca y agrega productos para empezar la venta.
            </Text>
          </View>
        )}

        <View style={styles.totalCard}>
          <View style={styles.totalHeader}>
            <Text style={styles.totalTitle}>Resumen de venta</Text>
            <Text style={styles.sampleLabel}>TASA BD</Text>
          </View>
          <View style={styles.currencyRow}>
            <Text style={styles.currencyLabel}>Total en pesos</Text>
            <Text style={styles.currencyValue}>
              {currencyFormatter.format(totalPesos)}
            </Text>
          </View>
          <View style={styles.currencyRow}>
            <Text style={styles.currencyLabel}>Total en bolívares</Text>
            <Text style={styles.currencyValue}>
              {totalBolivares === null
                ? '—'
                : `Bs. ${bolivarFormatter.format(totalBolivares)}`}
            </Text>
          </View>
          <View style={[styles.currencyRow, styles.lastCurrencyRow]}>
            <Text style={styles.currencyLabel}>Total en dólares</Text>
            <Text style={styles.currencyValue}>
              {totalDolares === null
                ? '—'
                : `$ ${dollarFormatter.format(totalDolares)}`}
            </Text>
          </View>
          {exchangeRateError && (
            <Text style={styles.rateError}>{exchangeRateError}</Text>
          )}
          <View style={styles.totalDivider} />
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>
              {currencyFormatter.format(totalPesos)}
            </Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            disabled: saleLines.length === 0 || saleSubmitting,
          }}
          disabled={saleLines.length === 0 || saleSubmitting}
          onPress={openCurrencyDialog}
          style={({ pressed }) => [
            styles.confirmButton,
            (saleLines.length === 0 || saleSubmitting) &&
              styles.disabledConfirmButton,
            pressed && styles.confirmButtonPressed,
          ]}
        >
          {saleSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.confirmButtonText}>✓</Text>
              <Text style={styles.confirmButtonText}>Confirmar venta</Text>
            </>
          )}
        </Pressable>
        {productsError && (
          <Text style={styles.saleErrorMessage}>{productsError}</Text>
        )}
        <Text style={styles.footerNote}>
          Conversión según la última tasa registrada en la base de datos
        </Text>
      </ScrollView>
      <View style={styles.menuIsland}>
        {menuOpen && (
          <View style={styles.menuOptions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setMenuOpen(false)}
              style={({ pressed }) => [
                styles.menuOption,
                styles.menuOptionBorder,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.menuOptionIcon}>⌂</Text>
              <Text style={styles.menuOptionText}>Nueva venta</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setMenuOpen(false);
                setShowPendingSales(true);
              }}
              style={({ pressed }) => [
                styles.menuOption,
                styles.menuOptionBorder,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.menuOptionIcon}>✓</Text>
              <Text style={styles.menuOptionText}>Confirmar ventas</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setMenuOpen(false);
                setShowSalesHistory(true);
              }}
              style={({ pressed }) => [
                styles.menuOption,
                styles.menuOptionBorder,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.menuOptionIcon}>▤</Text>
              <Text style={styles.menuOptionText}>Historial de ventas</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setMenuOpen(false);
                setShowAddProduct(true);
              }}
              style={({ pressed }) => [
                styles.menuOption,
                styles.menuOptionBorder,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.menuOptionIcon}>＋</Text>
              <Text style={styles.menuOptionText}>Agregar producto</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={openRatePassword}
              style={({ pressed }) => [
                styles.menuOption,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.menuOptionIcon}>↗</Text>
              <Text style={styles.menuOptionText}>Cambiar tipo de cambio</Text>
            </Pressable>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          onPress={() => setMenuOpen((open) => !open)}
          style={({ pressed }) => [
            styles.menuButton,
            pressed && styles.confirmButtonPressed,
          ]}
        >
          <Text style={styles.menuButtonIcon}>{menuOpen ? '×' : '☰'}</Text>
          <Text style={styles.menuButtonText}>{menuOpen ? 'Cerrar' : 'Menú'}</Text>
        </Pressable>
      </View>
      <Modal
        animationType="fade"
        transparent
        visible={currencyDialogOpen}
        onRequestClose={() => {
          if (!saleSubmitting) setCurrencyDialogOpen(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.currencyDialogCard}>
            <Text style={styles.passwordTitle}>¿En qué moneda pagó?</Text>
            <Text style={styles.passwordSubtitle}>
              Selecciona la moneda recibida para guardar la venta.
            </Text>
            {(
              [
                ['VES', 'Bolívares', 'Bs.'],
                ['COP', 'Pesos colombianos', 'COP'],
                ['USD', 'Dólares', 'USD'],
              ] as const
            ).map(([currency, label, symbol]) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: selectedCurrency === currency }}
                key={currency}
                onPress={() => setSelectedCurrency(currency)}
                style={({ pressed }) => [
                  styles.currencyChoice,
                  selectedCurrency === currency && styles.currencyChoiceSelected,
                  pressed && styles.pressed,
                ]}
              >
                <View
                  style={[
                    styles.currencyRadio,
                    selectedCurrency === currency && styles.currencyRadioSelected,
                  ]}
                >
                  {selectedCurrency === currency && (
                    <View style={styles.currencyRadioDot} />
                  )}
                </View>
                <Text style={styles.currencyChoiceName}>{label}</Text>
                <Text style={styles.currencyChoiceSymbol}>{symbol}</Text>
                <Text style={styles.currencyChoiceAmount}>
                  {selectedCurrency === currency &&
                    (currency === 'COP' || exchangeRate
                      ? formatSaleAmount(
                          currencyPreviewTotal(currency),
                          currency,
                        )
                      : 'Tasa no disponible')}
                </Text>
              </Pressable>
            ))}
            {selectedCurrency !== 'COP' && !exchangeRate && (
              <Text style={styles.passwordError}>
                {exchangeRateError ?? 'Cargando o verificando tasas de cambio.'}
              </Text>
            )}
            {currencyError && (
              <Text style={styles.passwordError}>{currencyError}</Text>
            )}
            <Pressable
              accessibilityRole="button"
              disabled={
                saleSubmitting ||
                (selectedCurrency !== 'COP' && exchangeRate === null)
              }
              onPress={() => void confirmSale()}
              style={({ pressed }) => [
                styles.confirmButton,
                styles.currencyConfirmButton,
                (pressed ||
                  saleSubmitting ||
                  (selectedCurrency !== 'COP' && exchangeRate === null)) &&
                  styles.confirmButtonPressed,
              ]}
            >
              {saleSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmButtonText}>
                  Registrar en {selectedCurrency}
                </Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={saleSubmitting}
              onPress={() => setCurrencyDialogOpen(false)}
              style={styles.cancelPasswordButton}
            >
              <Text style={styles.cancelPasswordText}>Cancelar</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        animationType="fade"
        transparent
        visible={passwordDialogOpen}
        onRequestClose={() => setPasswordDialogOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.passwordCard}>
            <View style={styles.passwordIcon}>
              <Text style={styles.passwordIconText}>⌑</Text>
            </View>
            <Text style={styles.passwordTitle}>Acceso protegido</Text>
            <Text style={styles.passwordSubtitle}>
              Ingresa la clave para cambiar las tasas.
            </Text>
            <TextInput
              accessibilityLabel="Clave de acceso a tasas"
              autoFocus
              onChangeText={setEnteredPassword}
              onSubmitEditing={enterRateSettings}
              placeholder="Clave"
              placeholderTextColor="#97A1AF"
              returnKeyType="done"
              secureTextEntry
              style={styles.passwordInput}
              value={enteredPassword}
            />
            {passwordError && (
              <Text style={styles.passwordError}>{passwordError}</Text>
            )}
            <Pressable
              accessibilityRole="button"
              disabled={verifyingPassword || enteredPassword.length === 0}
              onPress={enterRateSettings}
              style={({ pressed }) => [
                styles.confirmButton,
                styles.passwordSubmit,
                (pressed || verifyingPassword || enteredPassword.length === 0) &&
                  styles.confirmButtonPressed,
              ]}
            >
              {verifyingPassword ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmButtonText}>Continuar</Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPasswordDialogOpen(false)}
              style={styles.cancelPasswordButton}
            >
              <Text style={styles.cancelPasswordText}>Cancelar</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

type PendingSalesScreenProps = {
  onBack: () => void;
  onSaleConfirmed: () => Promise<void>;
};

function PendingSalesScreen({
  onBack,
  onSaleConfirmed,
}: PendingSalesScreenProps) {
  const [sales, setSales] = useState<PendingSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [activeSaleId, setActiveSaleId] = useState<number | null>(null);
  const [saleToCancel, setSaleToCancel] = useState<PendingSale | null>(null);
  const [cancelPassword, setCancelPassword] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const refreshSales = async () => {
    setLoading(true);
    setError(null);
    try {
      setSales(await getPendingSales());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No se pudieron cargar las ventas pendientes.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshSales();
  }, []);

  const confirmSale = async (sale: PendingSale) => {
    setActiveSaleId(sale.id);
    setActionMessage(null);
    setError(null);
    try {
      await confirmPendingSale(sale.id);
      setActionMessage(`Venta #${sale.id} confirmada e inventario actualizado.`);
      await onSaleConfirmed();
      await refreshSales();
    } catch (confirmError) {
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : 'No se pudo confirmar la venta.',
      );
    } finally {
      setActiveSaleId(null);
    }
  };

  const cancelSale = async () => {
    if (!saleToCancel) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await cancelPendingSale(saleToCancel.id, cancelPassword);
      setActionMessage(`Venta #${saleToCancel.id} anulada.`);
      setSaleToCancel(null);
      setCancelPassword('');
      await refreshSales();
    } catch (cancelRequestError) {
      setCancelError(
        cancelRequestError instanceof Error
          ? cancelRequestError.message
          : 'No se pudo anular la venta.',
      );
    } finally {
      setCancelling(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.rateScreenContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.backButtonText}>‹  Volver a la venta</Text>
        </Pressable>
        <View style={styles.rateHeader}>
          <Text style={styles.eyebrow}>VENTAS</Text>
          <Text style={styles.title}>Confirmar ventas</Text>
          <Text style={styles.subtitle}>
            Revisa el cobro antes de descontar los productos del inventario.
          </Text>
        </View>

        {actionMessage && (
          <Text style={styles.successBanner}>{actionMessage}</Text>
        )}
        {error && <Text style={styles.errorBanner}>{error}</Text>}

        {loading ? (
          <ActivityIndicator color="#19866A" style={styles.rateLoading} />
        ) : sales.length === 0 ? (
          <View style={styles.emptyCart}>
            <Text style={styles.emptyCartText}>
              No hay ventas pendientes de confirmación.
            </Text>
          </View>
        ) : (
          sales.map((sale) => (
            <View key={sale.id} style={styles.pendingSaleCard}>
              <View style={styles.pendingSaleHeader}>
                <View>
                  <Text style={styles.pendingSaleTitle}>Venta #{sale.id}</Text>
                  <Text style={styles.pendingSaleDate}>
                    {new Date(sale.fecha).toLocaleString('es-CO')}
                  </Text>
                  <Text style={styles.pendingCurrency}>
                    Cobro en {sale.moneda}
                  </Text>
                </View>
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>Pendiente</Text>
                </View>
              </View>
              {sale.items.map((item) => (
                <View
                  key={`${sale.id}-${item.producto_id}`}
                  style={styles.pendingItem}
                >
                  <Text style={styles.pendingItemName}>
                    {item.cantidad} × {item.descripcion}
                  </Text>
                  <Text style={styles.pendingItemPrice}>
                    {formatSaleAmount(
                      item.cantidad * item.precio_unitario,
                      sale.moneda,
                    )}
                  </Text>
                </View>
              ))}
              <View style={styles.pendingTotalRow}>
                <Text style={styles.pendingTotalLabel}>Total</Text>
                <Text style={styles.pendingTotalValue}>
                  {formatSaleAmount(sale.monto_total, sale.moneda)}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={activeSaleId !== null || cancelling}
                onPress={() => void confirmSale(sale)}
                style={({ pressed }) => [
                  styles.confirmButton,
                  styles.pendingConfirmButton,
                  (pressed || activeSaleId !== null || cancelling) &&
                    styles.confirmButtonPressed,
                ]}
              >
                {activeSaleId === sale.id ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmButtonText}>
                    Confirmar venta y descontar inventario
                  </Text>
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={activeSaleId !== null || cancelling}
                onPress={() => {
                  setSaleToCancel(sale);
                  setCancelPassword('');
                  setCancelError(null);
                }}
                style={({ pressed }) => [
                  styles.cancelSaleButton,
                  (pressed || activeSaleId !== null || cancelling) &&
                    styles.confirmButtonPressed,
                ]}
              >
                <Text style={styles.cancelSaleButtonText}>Anular venta</Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={saleToCancel !== null}
        onRequestClose={() => {
          if (!cancelling) setSaleToCancel(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.passwordCard}>
            <View style={styles.passwordIcon}>
              <Text style={styles.cancelDialogIcon}>!</Text>
            </View>
            <Text style={styles.passwordTitle}>Anular venta</Text>
            <Text style={styles.passwordSubtitle}>
              La venta #{saleToCancel?.id} y sus detalles se eliminarán. Ingresa
              la clave de confirmación.
            </Text>
            <TextInput
              accessibilityLabel="Clave para anular la venta"
              autoFocus
              editable={!cancelling}
              onChangeText={setCancelPassword}
              onSubmitEditing={() => void cancelSale()}
              placeholder="Clave de confirmación"
              placeholderTextColor="#97A1AF"
              returnKeyType="done"
              secureTextEntry
              style={styles.cancelPasswordInput}
              value={cancelPassword}
            />
            {cancelError && (
              <Text style={styles.passwordError}>{cancelError}</Text>
            )}
            <Pressable
              accessibilityRole="button"
              disabled={cancelling || cancelPassword.length === 0}
              onPress={() => void cancelSale()}
              style={({ pressed }) => [
                styles.cancelSubmitButton,
                (pressed || cancelling || cancelPassword.length === 0) &&
                  styles.confirmButtonPressed,
              ]}
            >
              {cancelling ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmButtonText}>Confirmar anulación</Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={cancelling}
              onPress={() => setSaleToCancel(null)}
              style={styles.cancelPasswordButton}
            >
              <Text style={styles.cancelPasswordText}>Volver</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

type SalesHistoryScreenProps = {
  onBack: () => void;
};

function SalesHistoryScreen({ onBack }: SalesHistoryScreenProps) {
  const [sales, setSales] = useState<SaleHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      setSales(await getSalesHistory());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No se pudo cargar el historial de ventas.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshHistory();
  }, []);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.rateScreenContainer}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.backButtonText}>‹  Volver a la venta</Text>
        </Pressable>
        <View style={styles.rateHeader}>
          <Text style={styles.eyebrow}>REGISTRO</Text>
          <Text style={styles.title}>Historial de ventas</Text>
          <Text style={styles.subtitle}>
            Revisa los productos, el total y si cada venta fue confirmada.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={loading}
          onPress={() => void refreshHistory()}
          style={({ pressed }) => [
            styles.historyRefreshButton,
            (pressed || loading) && styles.pressed,
          ]}
        >
          <Text style={styles.historyRefreshText}>
            {loading ? 'Actualizando…' : 'Actualizar historial'}
          </Text>
        </Pressable>

        {error && <Text style={styles.errorBanner}>{error}</Text>}
        {loading ? (
          <ActivityIndicator color="#19866A" style={styles.rateLoading} />
        ) : !error && sales.length === 0 ? (
          <View style={styles.emptyCart}>
            <Text style={styles.emptyCartText}>
              No hay ventas registradas en el historial disponible.
            </Text>
          </View>
        ) : (
          sales.map((sale) => (
            <View key={sale.id} style={styles.pendingSaleCard}>
              <View style={styles.pendingSaleHeader}>
                <View style={styles.historySaleHeading}>
                  <Text style={styles.pendingSaleTitle}>Venta #{sale.id}</Text>
                  <Text style={styles.pendingSaleDate}>
                    {new Date(sale.fecha).toLocaleString('es-CO')}
                  </Text>
                  <Text style={styles.pendingCurrency}>
                    Cobro en {sale.moneda}
                  </Text>
                </View>
                <View
                  style={
                    sale.confirmada
                      ? styles.confirmedBadge
                      : styles.pendingBadge
                  }
                >
                  <Text
                    style={
                      sale.confirmada
                        ? styles.confirmedBadgeText
                        : styles.pendingBadgeText
                    }
                  >
                    {sale.confirmada ? 'Confirmada' : 'Pendiente'}
                  </Text>
                </View>
              </View>
              {sale.items.map((item) => (
                <View
                  key={`${sale.id}-${item.producto_id}`}
                  style={styles.pendingItem}
                >
                  <Text style={styles.pendingItemName}>
                    {item.cantidad} × {item.descripcion}
                  </Text>
                  <Text style={styles.pendingItemPrice}>
                    {formatSaleAmount(
                      item.cantidad * item.precio_unitario,
                      sale.moneda,
                    )}
                  </Text>
                </View>
              ))}
              <View style={styles.pendingTotalRow}>
                <Text style={styles.pendingTotalLabel}>Total</Text>
                <Text style={styles.pendingTotalValue}>
                  {formatSaleAmount(sale.monto_total, sale.moneda)}
                </Text>
              </View>
            </View>
          ))
        )}
        <Text style={styles.historyRetentionNote}>
          El historial conserva las ventas durante un mes; las más antiguas se
          eliminan automáticamente junto con sus detalles.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

type RateSettingsScreenProps = {
  initialRate: ExchangeRate | null;
  password: string;
  onBack: () => void;
  onSaved: (rate: ExchangeRate) => void;
};

function RateSettingsScreen({
  initialRate,
  password,
  onBack,
  onSaved,
}: RateSettingsScreenProps) {
  const [bolivarRate, setBolivarRate] = useState(
    initialRate ? String(initialRate.cambio_bs) : '',
  );
  const [dollarRate, setDollarRate] = useState(
    initialRate ? String(initialRate.cambio_dolares) : '',
  );
  const [loading, setLoading] = useState(initialRate === null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (initialRate) {
      setBolivarRate(String(initialRate.cambio_bs));
      setDollarRate(String(initialRate.cambio_dolares));
      setLoading(false);
      return;
    }

    let active = true;
    getExchangeRate()
      .then((rate) => {
        if (active) {
          setBolivarRate(String(rate.cambio_bs));
          setDollarRate(String(rate.cambio_dolares));
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'No se pudo cargar el tipo de cambio.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [initialRate]);

  const saveRates = async () => {
    const parsedBolivarRate = Number(bolivarRate.trim().replace(',', '.'));
    const parsedDollarRate = Number(dollarRate.trim().replace(',', '.'));
    if (
      !Number.isFinite(parsedBolivarRate) ||
      parsedBolivarRate <= 0 ||
      !Number.isFinite(parsedDollarRate) ||
      parsedDollarRate <= 0
    ) {
      setError('Ingresa dos tasas numéricas mayores que cero.');
      setSaved(false);
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updatedRate = await updateExchangeRate(
        {
          cambio_bs: parsedBolivarRate,
          cambio_dolares: parsedDollarRate,
        },
        password,
      );
      setBolivarRate(String(updatedRate.cambio_bs));
      setDollarRate(String(updatedRate.cambio_dolares));
      onSaved(updatedRate);
      setSaved(true);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'No se pudo guardar el tipo de cambio.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.rateScreenContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.backButtonText}>‹  Volver a la venta</Text>
        </Pressable>
        <View style={styles.rateHeader}>
          <Text style={styles.eyebrow}>CONFIGURACIÓN</Text>
          <Text style={styles.title}>Cambiar tipo de cambio</Text>
          <Text style={styles.subtitle}>
            Actualiza las tasas que se usan para convertir los precios.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color="#19866A" style={styles.rateLoading} />
        ) : (
          <View style={styles.rateFormCard}>
            <Text style={styles.fieldLabel}>TASAS ACTUALES</Text>
            <Text style={styles.rateHint}>
              El precio en pesos se divide entre cada valor.
            </Text>
            <Text style={styles.rateFieldLabel}>Bolívares (Bs.)</Text>
            <View style={styles.rateInputRow}>
              <Text style={styles.ratePrefix}>Bs.</Text>
              <TextInput
                accessibilityLabel="Tasa de cambio para bolívares"
                keyboardType="decimal-pad"
                onChangeText={(value) => {
                  setBolivarRate(value);
                  setSaved(false);
                }}
                selectTextOnFocus
                style={styles.rateInput}
                value={bolivarRate}
              />
            </View>
            <Text style={styles.rateExample}>
              Ejemplo: $5.000 COP ÷ {bolivarRate || '—'} = bolívares
            </Text>

            <Text style={styles.rateFieldLabel}>Dólares (USD)</Text>
            <View style={styles.rateInputRow}>
              <Text style={styles.ratePrefix}>USD</Text>
              <TextInput
                accessibilityLabel="Tasa de cambio para dólares"
                keyboardType="decimal-pad"
                onChangeText={(value) => {
                  setDollarRate(value);
                  setSaved(false);
                }}
                selectTextOnFocus
                style={styles.rateInput}
                value={dollarRate}
              />
            </View>
            <Text style={styles.rateExample}>
              Ejemplo: $5.000 COP ÷ {dollarRate || '—'} = dólares
            </Text>

            {error && <Text style={styles.passwordError}>{error}</Text>}
            {saved && (
              <Text style={styles.successMessage}>
                Tipo de cambio actualizado correctamente.
              </Text>
            )}
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={saveRates}
              style={({ pressed }) => [
                styles.confirmButton,
                styles.saveRateButton,
                (pressed || saving) && styles.confirmButtonPressed,
              ]}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmButtonText}>Guardar cambios</Text>
              )}
            </Pressable>
          </View>
        )}
        <Text style={styles.footerNote}>
          Los cambios se guardan en la tabla cambio de PostgreSQL.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

type AddProductScreenProps = {
  onBack: () => void;
  onViewInventory: () => void;
  onCreated: (product: Product) => void;
};

function AddProductScreen({
  onBack,
  onViewInventory,
  onCreated,
}: AddProductScreenProps) {
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveProduct = async () => {
    const parsedQuantity = Number(quantity.trim());
    const parsedPrice = Number(price.trim().replace(',', '.'));

    if (!description.trim()) {
      setError('Escribe la descripción del producto.');
      return;
    }

    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 0) {
      setError('La cantidad debe ser un número entero igual o mayor que cero.');
      return;
    }

    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setError('El monto en pesos debe ser un número igual o mayor que cero.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const product = await createProduct({
        descripcion: description.trim(),
        cantidad: parsedQuantity,
        precio_pesos: parsedPrice,
      });
      onCreated(product);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'No se pudo guardar el producto.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.rateScreenContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.backButtonText}>‹  Volver a la venta</Text>
        </Pressable>
        <View style={styles.rateHeader}>
          <Text style={styles.eyebrow}>INVENTARIO</Text>
          <Text style={styles.title}>Agregar producto</Text>
          <Text style={styles.subtitle}>
            Registra la descripción, existencia y precio en pesos.
          </Text>
        </View>

        <View style={styles.rateFormCard}>
          <Text style={styles.fieldLabel}>DATOS DEL PRODUCTO</Text>
          <Text style={styles.rateFieldLabel}>Descripción</Text>
          <TextInput
            accessibilityLabel="Descripción del producto"
            autoCapitalize="sentences"
            onChangeText={setDescription}
            placeholder="Ej. Arroz blanco 1 kg"
            placeholderTextColor="#97A1AF"
            returnKeyType="next"
            style={styles.productFormInput}
            value={description}
          />

          <Text style={styles.rateFieldLabel}>Cantidad</Text>
          <TextInput
            accessibilityLabel="Cantidad disponible"
            keyboardType="number-pad"
            onChangeText={setQuantity}
            placeholder="Ej. 10"
            placeholderTextColor="#97A1AF"
            returnKeyType="next"
            style={styles.productFormInput}
            value={quantity}
          />

          <Text style={styles.rateFieldLabel}>Monto en pesos (COP)</Text>
          <View style={styles.rateInputRow}>
            <Text style={styles.ratePrefix}>COP</Text>
            <TextInput
              accessibilityLabel="Monto del producto en pesos colombianos"
              keyboardType="decimal-pad"
              onChangeText={setPrice}
              placeholder="Ej. 5000"
              placeholderTextColor="#97A1AF"
              selectTextOnFocus
              style={styles.rateInput}
              value={price}
            />
          </View>

          {error && <Text style={styles.passwordError}>{error}</Text>}
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={saveProduct}
            style={({ pressed }) => [
              styles.confirmButton,
              styles.saveRateButton,
              (pressed || saving) && styles.confirmButtonPressed,
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.confirmButtonText}>Guardar producto</Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onViewInventory}
            style={({ pressed }) => [
              styles.viewInventoryButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.viewInventoryButtonText}>Ver inventario</Text>
          </Pressable>
        </View>
        <Text style={styles.footerNote}>
          El producto se guardará en la base de datos.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

type InventoryScreenProps = {
  onBack: () => void;
  onProductUpdated: (product: Product) => void;
  onProductDeleted: (productId: number) => void;
};

function InventoryScreen({
  onBack,
  onProductUpdated,
  onProductDeleted,
}: InventoryScreenProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [action, setAction] = useState<'edit' | 'delete' | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingPassword, setEditingPassword] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);

  const refreshInventory = async () => {
    setLoading(true);
    setError(null);
    try {
      const loadedProducts = await getProducts();
      setProducts(loadedProducts);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No se pudo cargar el inventario.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshInventory();
  }, []);

  const requestProductAction = (
    product: Product,
    requestedAction: 'edit' | 'delete',
  ) => {
    setSelectedProduct(product);
    setAction(requestedAction);
    setPassword('');
    setPasswordError(null);
  };

  const authorizeProductAction = async () => {
    if (!selectedProduct || !action) return;
    setVerifying(true);
    setPasswordError(null);
    try {
      await verifyInventoryPassword(password);
      if (action === 'delete') {
        await deleteProduct(selectedProduct.id, password);
        setProducts((current) =>
          current.filter((product) => product.id !== selectedProduct.id),
        );
        onProductDeleted(selectedProduct.id);
        setActionMessage('Producto eliminado del inventario.');
        setSelectedProduct(null);
        setAction(null);
        setPassword('');
      } else {
        setDescription(selectedProduct.descripcion);
        setQuantity(String(selectedProduct.cantidad));
        setPrice(String(selectedProduct.precio_pesos));
        setEditingProduct(selectedProduct);
        setEditingPassword(password);
        setAction(null);
        setPassword('');
      }
    } catch (actionError) {
      setPasswordError(
        actionError instanceof Error
          ? actionError.message
          : 'No se pudo completar la operación.',
      );
    } finally {
      setVerifying(false);
    }
  };

  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const saveEditedProduct = async () => {
    if (!editingProduct) return;
    const parsedQuantity = Number(quantity.trim());
    const parsedPrice = Number(price.trim().replace(',', '.'));
    if (!description.trim()) {
      setError('La descripción no puede estar vacía.');
      return;
    }
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 0) {
      setError('La cantidad debe ser un entero igual o mayor que cero.');
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setError('El monto en pesos debe ser igual o mayor que cero.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updatedProduct = await updateProduct(
        editingProduct.id,
        {
          descripcion: description.trim(),
          cantidad: parsedQuantity,
          precio_pesos: parsedPrice,
        },
        editingPassword,
      );
      setProducts((current) =>
        current
          .map((product) =>
            product.id === updatedProduct.id ? updatedProduct : product,
          )
          .sort((a, b) => a.descripcion.localeCompare(b.descripcion)),
      );
      onProductUpdated(updatedProduct);
      setActionMessage('Producto actualizado correctamente.');
      setEditingProduct(null);
      setEditingPassword('');
      setSelectedProduct(null);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'No se pudo actualizar el producto.',
      );
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditingProduct(null);
    setEditingPassword('');
    setSelectedProduct(null);
    setError(null);
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.rateScreenContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityRole="button"
          onPress={editingProduct ? cancelEdit : onBack}
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.backButtonText}>
            ‹  {editingProduct ? 'Volver al inventario' : 'Volver a agregar producto'}
          </Text>
        </Pressable>
        <View style={styles.rateHeader}>
          <Text style={styles.eyebrow}>INVENTARIO</Text>
          <Text style={styles.title}>
            {editingProduct ? 'Editar producto' : 'Inventario registrado'}
          </Text>
          <Text style={styles.subtitle}>
            {editingProduct
              ? 'Actualiza la descripción, cantidad o precio.'
              : 'Productos, existencias y precios actuales.'}
          </Text>
        </View>

        {actionMessage && (
          <Text style={styles.inventorySuccess}>{actionMessage}</Text>
        )}
        {error && !editingProduct && (
          <Text style={styles.errorBanner}>{error}</Text>
        )}
        {loading && !editingProduct ? (
          <ActivityIndicator color="#19866A" style={styles.rateLoading} />
        ) : editingProduct ? (
          <View style={styles.rateFormCard}>
            <Text style={styles.rateFieldLabel}>Descripción</Text>
            <TextInput
              accessibilityLabel="Editar descripción del producto"
              onChangeText={setDescription}
              style={styles.productFormInput}
              value={description}
            />
            <Text style={styles.rateFieldLabel}>Cantidad</Text>
            <TextInput
              accessibilityLabel="Editar cantidad del producto"
              keyboardType="number-pad"
              onChangeText={setQuantity}
              style={styles.productFormInput}
              value={quantity}
            />
            <Text style={styles.rateFieldLabel}>Monto en pesos (COP)</Text>
            <View style={styles.rateInputRow}>
              <Text style={styles.ratePrefix}>COP</Text>
              <TextInput
                accessibilityLabel="Editar monto del producto en pesos"
                keyboardType="decimal-pad"
                onChangeText={setPrice}
                style={styles.rateInput}
                value={price}
              />
            </View>
            {error && <Text style={styles.passwordError}>{error}</Text>}
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => void saveEditedProduct()}
              style={({ pressed }) => [
                styles.confirmButton,
                styles.saveRateButton,
                (pressed || saving) && styles.confirmButtonPressed,
              ]}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmButtonText}>Guardar cambios</Text>
              )}
            </Pressable>
          </View>
        ) : products.length === 0 && !error ? (
          <View style={styles.emptyCart}>
            <Text style={styles.emptyCartText}>
              No hay productos registrados en el inventario.
            </Text>
          </View>
        ) : (
          products.map((product) => (
            <View key={product.id} style={styles.inventoryProductCard}>
              <View style={styles.inventoryProductInfo}>
                <Text style={styles.inventoryProductName}>
                  {product.descripcion}
                </Text>
                <Text style={styles.inventoryProductDetail}>
                  Cantidad: {product.cantidad}
                </Text>
                <Text style={styles.inventoryProductPrice}>
                  {currencyFormatter.format(product.precio_pesos)}
                </Text>
              </View>
              <View style={styles.inventoryActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => requestProductAction(product, 'edit')}
                  style={({ pressed }) => [
                    styles.editProductButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.editProductButtonText}>Editar</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => requestProductAction(product, 'delete')}
                  style={({ pressed }) => [
                    styles.deleteProductButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.deleteProductButtonText}>Eliminar</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={action !== null}
        onRequestClose={() => {
          if (!verifying) {
            setAction(null);
            setPassword('');
            setPasswordError(null);
          }
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.passwordCard}>
            <View
              style={[
                styles.passwordIcon,
                action === 'delete' && styles.deletePasswordIcon,
              ]}
            >
              <Text
                style={[
                  styles.passwordIconText,
                  action === 'delete' && styles.cancelDialogIcon,
                ]}
              >
                {action === 'delete' ? '!' : '⌑'}
              </Text>
            </View>
            <Text style={styles.passwordTitle}>
              {action === 'delete' ? 'Confirmar eliminación' : 'Editar producto'}
            </Text>
            <Text style={styles.passwordSubtitle}>
              {action === 'delete'
                ? `¿Eliminar "${selectedProduct?.descripcion}"? Esta acción no se puede deshacer. Ingresa la clave.`
                : `Ingresa la clave para editar "${selectedProduct?.descripcion}".`}
            </Text>
            <TextInput
              accessibilityLabel="Clave de confirmación de inventario"
              autoFocus
              editable={!verifying}
              onChangeText={setPassword}
              onSubmitEditing={() => void authorizeProductAction()}
              placeholder="Clave de confirmación"
              placeholderTextColor="#97A1AF"
              returnKeyType="done"
              secureTextEntry
              style={styles.cancelPasswordInput}
              value={password}
            />
            {passwordError && (
              <Text style={styles.passwordError}>{passwordError}</Text>
            )}
            <Pressable
              accessibilityRole="button"
              disabled={verifying || password.length === 0}
              onPress={() => void authorizeProductAction()}
              style={({ pressed }) => [
                action === 'delete'
                  ? styles.cancelSubmitButton
                  : styles.confirmButton,
                styles.passwordSubmit,
                (pressed || verifying || password.length === 0) &&
                  styles.confirmButtonPressed,
              ]}
            >
              {verifying ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmButtonText}>
                  {action === 'delete' ? 'Eliminar producto' : 'Continuar'}
                </Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={verifying}
              onPress={() => {
                setAction(null);
                setPassword('');
                setPasswordError(null);
              }}
              style={styles.cancelPasswordButton}
            >
              <Text style={styles.cancelPasswordText}>Cancelar</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F7F8',
  },
  navigationContainer: {
    flex: 1,
  },
  backSwipeEdge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 28,
    zIndex: 100,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 110,
  },
  compactContainer: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  eyebrow: {
    color: '#19866A',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  title: {
    color: '#172B4D',
    fontSize: 29,
    fontWeight: '800',
    marginTop: 4,
  },
  compactTitle: {
    fontSize: 26,
  },
  subtitle: {
    color: '#7D8997',
    fontSize: 13,
    marginTop: 4,
  },
  saleConfirmationBanner: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#E9F6F1',
    marginBottom: 16,
  },
  saleConfirmationText: {
    color: '#19866A',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  saleErrorMessage: {
    color: '#A33A32',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
  },
  searchCard: {
    padding: 15,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    marginBottom: 24,
  },
  fieldLabel: {
    color: '#7D8997',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 10,
  },
  searchBox: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E8EDF0',
    borderRadius: 12,
    backgroundColor: '#FAFBFC',
  },
  searchIcon: {
    color: '#19866A',
    fontSize: 24,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    color: '#253858',
    fontSize: 13,
  },
  suggestions: {
    marginTop: 6,
  },
  suggestion: {
    minHeight: 55,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
  },
  suggestionPlus: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#E9F6F1',
  },
  suggestionPlusText: {
    color: '#19866A',
    fontSize: 20,
    fontWeight: '600',
    marginTop: -2,
  },
  suggestionInfo: {
    flex: 1,
    marginLeft: 10,
  },
  suggestionName: {
    color: '#253858',
    fontSize: 12,
    fontWeight: '700',
  },
  suggestionPrice: {
    color: '#8591A0',
    fontSize: 11,
    marginTop: 3,
  },
  suggestionAction: {
    color: '#19866A',
    fontSize: 11,
    fontWeight: '700',
  },
  noSuggestions: {
    color: '#8591A0',
    fontSize: 12,
    paddingVertical: 12,
  },
  suggestionsLoading: {
    paddingVertical: 12,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#172B4D',
    fontSize: 17,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: '#8993A2',
    fontSize: 11,
    marginTop: 4,
  },
  cartBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: '#E9F6F1',
  },
  cartBadgeText: {
    color: '#19866A',
    fontSize: 11,
    fontWeight: '700',
  },
  saleList: {
    paddingHorizontal: 13,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    marginBottom: 17,
  },
  saleLine: {
    minHeight: 77,
    flexDirection: 'row',
    alignItems: 'center',
  },
  saleLineBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F3',
  },
  productMark: {
    width: 37,
    height: 37,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#F0F5F4',
  },
  productMarkText: {
    color: '#19866A',
    fontSize: 15,
    fontWeight: '800',
  },
  productInfo: {
    flex: 1,
    marginHorizontal: 9,
  },
  productName: {
    color: '#253858',
    fontSize: 12,
    fontWeight: '700',
  },
  productPrice: {
    color: '#8993A2',
    fontSize: 10,
    marginTop: 5,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  quantityButton: {
    width: 27,
    height: 27,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: '#F1F4F5',
  },
  quantityButtonText: {
    color: '#526171',
    fontSize: 17,
    lineHeight: 20,
  },
  addQuantityButton: {
    backgroundColor: '#E9F6F1',
  },
  addQuantityButtonText: {
    color: '#19866A',
    fontSize: 17,
    lineHeight: 20,
  },
  quantityValue: {
    minWidth: 14,
    color: '#253858',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyCart: {
    padding: 20,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    marginBottom: 17,
  },
  emptyCartText: {
    color: '#8993A2',
    fontSize: 12,
    textAlign: 'center',
  },
  totalCard: {
    padding: 17,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    marginBottom: 15,
  },
  totalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  totalTitle: {
    color: '#172B4D',
    fontSize: 15,
    fontWeight: '800',
  },
  sampleLabel: {
    color: '#A0AAB5',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  rateError: {
    color: '#A33A32',
    fontSize: 10,
    marginTop: 7,
  },
  currencyRow: {
    minHeight: 31,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  currencyLabel: {
    color: '#758191',
    fontSize: 12,
  },
  currencyValue: {
    color: '#253858',
    fontSize: 12,
    fontWeight: '700',
  },
  lastCurrencyRow: {
    marginBottom: 5,
  },
  totalDivider: {
    height: 1,
    backgroundColor: '#EEF1F3',
    marginVertical: 7,
  },
  grandTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 3,
  },
  grandTotalLabel: {
    color: '#172B4D',
    fontSize: 14,
    fontWeight: '800',
  },
  grandTotalValue: {
    color: '#19866A',
    fontSize: 19,
    fontWeight: '800',
  },
  confirmButton: {
    minHeight: 53,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 15,
    backgroundColor: '#19866A',
  },
  confirmButtonPressed: {
    opacity: 0.85,
  },
  disabledConfirmButton: {
    backgroundColor: '#AAB8B3',
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  footerNote: {
    color: '#98A2AD',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 10,
  },
  menuIsland: {
    position: 'absolute',
    right: 18,
    bottom: 14,
    alignItems: 'flex-end',
  },
  menuButton: {
    minWidth: 112,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 17,
    borderRadius: 25,
    backgroundColor: '#172B4D',
    elevation: 5,
    shadowColor: '#172B4D',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 7,
  },
  menuButtonIcon: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
  },
  menuButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  menuOptions: {
    width: 225,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
    elevation: 7,
    shadowColor: '#172B4D',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 9,
  },
  menuOption: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  menuOptionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F3',
  },
  menuOptionIcon: {
    width: 28,
    color: '#19866A',
    fontSize: 19,
    fontWeight: '700',
    textAlign: 'center',
  },
  menuOptionText: {
    color: '#253858',
    fontSize: 13,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
    backgroundColor: 'rgba(23, 43, 77, 0.42)',
  },
  passwordCard: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    padding: 23,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
  },
  currencyDialogCard: {
    width: '100%',
    maxWidth: 390,
    alignItems: 'stretch',
    padding: 21,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
  },
  currencyChoice: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: '#E8ECEF',
    borderRadius: 12,
    marginBottom: 8,
  },
  currencyChoiceSelected: {
    borderColor: '#19866A',
    backgroundColor: '#F0F8F5',
  },
  currencyRadio: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#AAB4BE',
    borderRadius: 9,
    marginRight: 10,
  },
  currencyRadioSelected: {
    borderColor: '#19866A',
  },
  currencyRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#19866A',
  },
  currencyChoiceName: {
    flex: 1,
    color: '#253858',
    fontSize: 13,
    fontWeight: '700',
  },
  currencyChoiceSymbol: {
    color: '#7D8997',
    fontSize: 11,
    marginRight: 9,
  },
  currencyChoiceAmount: {
    minWidth: 68,
    color: '#19866A',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  currencyConfirmButton: {
    width: '100%',
    marginTop: 10,
  },
  passwordIcon: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#E9F6F1',
    marginBottom: 13,
  },
  deletePasswordIcon: {
    backgroundColor: '#FFF1F0',
  },
  passwordIconText: {
    color: '#19866A',
    fontSize: 25,
    fontWeight: '700',
  },
  passwordTitle: {
    color: '#172B4D',
    fontSize: 19,
    fontWeight: '800',
  },
  passwordSubtitle: {
    color: '#7D8997',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 17,
  },
  passwordInput: {
    width: '100%',
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2E8EC',
    borderRadius: 12,
    color: '#253858',
    fontSize: 16,
    letterSpacing: 4,
    textAlign: 'center',
  },
  passwordError: {
    alignSelf: 'stretch',
    color: '#A33A32',
    fontSize: 12,
    marginTop: 10,
  },
  passwordSubmit: {
    width: '100%',
    marginTop: 17,
  },
  cancelPasswordButton: {
    padding: 12,
    marginTop: 3,
  },
  cancelPasswordText: {
    color: '#7D8997',
    fontSize: 13,
    fontWeight: '600',
  },
  pendingSaleCard: {
    padding: 16,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    marginBottom: 13,
  },
  pendingSaleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F3',
    marginBottom: 7,
  },
  historySaleHeading: {
    flex: 1,
  },
  pendingSaleTitle: {
    color: '#172B4D',
    fontSize: 15,
    fontWeight: '800',
  },
  pendingSaleDate: {
    color: '#8993A2',
    fontSize: 10,
    marginTop: 4,
  },
  pendingCurrency: {
    color: '#19866A',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  pendingBadge: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: '#FFF3DF',
  },
  pendingBadgeText: {
    color: '#B7791F',
    fontSize: 10,
    fontWeight: '700',
  },
  confirmedBadge: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: '#E9F6F1',
  },
  confirmedBadgeText: {
    color: '#19866A',
    fontSize: 10,
    fontWeight: '700',
  },
  pendingItem: {
    minHeight: 31,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pendingItemName: {
    flex: 1,
    color: '#526171',
    fontSize: 11,
  },
  pendingItemPrice: {
    color: '#526171',
    fontSize: 11,
    fontWeight: '600',
  },
  pendingTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 11,
    marginTop: 6,
    marginBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEF1F3',
  },
  pendingTotalLabel: {
    color: '#172B4D',
    fontSize: 13,
    fontWeight: '800',
  },
  pendingTotalValue: {
    color: '#19866A',
    fontSize: 16,
    fontWeight: '800',
  },
  pendingConfirmButton: {
    paddingHorizontal: 10,
    marginTop: 2,
  },
  cancelSaleButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F2DADA',
    borderRadius: 13,
    backgroundColor: '#FFF8F8',
    marginTop: 8,
  },
  cancelSaleButtonText: {
    color: '#A33A32',
    fontSize: 13,
    fontWeight: '700',
  },
  successBanner: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#E9F6F1',
    color: '#19866A',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
  },
  errorBanner: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFF1F0',
    color: '#A33A32',
    fontSize: 12,
    marginBottom: 12,
  },
  cancelDialogIcon: {
    color: '#A33A32',
    fontSize: 23,
    fontWeight: '800',
  },
  cancelPasswordInput: {
    width: '100%',
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2E8EC',
    borderRadius: 12,
    color: '#253858',
    fontSize: 15,
  },
  cancelSubmitButton: {
    width: '100%',
    minHeight: 49,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#A33A32',
    marginTop: 15,
  },
  rateScreenContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 28,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 9,
    paddingRight: 12,
    marginBottom: 24,
  },
  backButtonText: {
    color: '#19866A',
    fontSize: 13,
    fontWeight: '700',
  },
  rateHeader: {
    marginBottom: 23,
  },
  historyRefreshButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#D5E8E1',
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    marginBottom: 14,
  },
  historyRefreshText: {
    color: '#19866A',
    fontSize: 12,
    fontWeight: '700',
  },
  historyRetentionNote: {
    color: '#8993A2',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 10,
  },
  rateFormCard: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  viewInventoryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#19866A',
    borderRadius: 14,
    marginTop: 10,
  },
  viewInventoryButtonText: {
    color: '#19866A',
    fontSize: 14,
    fontWeight: '800',
  },
  inventorySuccess: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#E9F6F1',
    color: '#19866A',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
  },
  inventoryProductCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
  },
  inventoryProductInfo: {
    flex: 1,
    marginRight: 9,
  },
  inventoryProductName: {
    color: '#253858',
    fontSize: 13,
    fontWeight: '800',
  },
  inventoryProductDetail: {
    color: '#7D8997',
    fontSize: 11,
    marginTop: 5,
  },
  inventoryProductPrice: {
    color: '#19866A',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  inventoryActions: {
    alignItems: 'stretch',
    gap: 7,
  },
  editProductButton: {
    minWidth: 72,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: '#E9F6F1',
  },
  editProductButtonText: {
    color: '#19866A',
    fontSize: 11,
    fontWeight: '800',
  },
  deleteProductButton: {
    minWidth: 72,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F2DADA',
    borderRadius: 9,
    backgroundColor: '#FFF8F8',
  },
  deleteProductButtonText: {
    color: '#A33A32',
    fontSize: 11,
    fontWeight: '800',
  },
  rateHint: {
    color: '#8993A2',
    fontSize: 12,
    marginTop: -4,
    marginBottom: 18,
  },
  rateFieldLabel: {
    color: '#253858',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  rateInputRow: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#E2E8EC',
    borderRadius: 12,
    backgroundColor: '#FAFBFC',
  },
  ratePrefix: {
    minWidth: 38,
    color: '#19866A',
    fontSize: 14,
    fontWeight: '800',
  },
  rateInput: {
    flex: 1,
    height: '100%',
    color: '#172B4D',
    fontSize: 18,
    fontWeight: '700',
  },
  productFormInput: {
    height: 50,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#E2E8EC',
    borderRadius: 12,
    backgroundColor: '#FAFBFC',
    color: '#172B4D',
    fontSize: 15,
    marginBottom: 18,
  },
  rateExample: {
    color: '#8993A2',
    fontSize: 11,
    marginTop: 7,
    marginBottom: 19,
  },
  rateLoading: {
    paddingVertical: 40,
  },
  saveRateButton: {
    marginTop: 18,
  },
  successMessage: {
    color: '#19866A',
    fontSize: 12,
    marginTop: 10,
  },
  pressed: {
    opacity: 0.65,
  },
});
