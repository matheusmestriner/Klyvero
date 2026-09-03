import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../lib/auth-context';
import { Icon } from '../components/icons';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import LeadsScreen from '../screens/LeadsScreen';
import LeadDetailScreen from '../screens/LeadDetailScreen';
import PipelineScreen from '../screens/PipelineScreen';
import CompaniesScreen from '../screens/CompaniesScreen';
import ContactsScreen from '../screens/ContactsScreen';
import ProspectingScreen from '../screens/ProspectingScreen';
import InboxScreen from '../screens/InboxScreen';
import ConversationScreen from '../screens/ConversationScreen';
import CalendarScreen from '../screens/CalendarScreen';
import MoreScreen from '../screens/MoreScreen';
import ProfileScreen from '../screens/ProfileScreen';
import WhiteLabelScreen from '../screens/WhiteLabelScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import CampaignsScreen from '../screens/CampaignsScreen';
import AIAgentsScreen from '../screens/AIAgentsScreen';
import IntegrationsScreen from '../screens/IntegrationsScreen';
import TeamScreen from '../screens/TeamScreen';
import ApiKeysScreen from '../screens/ApiKeysScreen';
import WebhooksScreen from '../screens/WebhooksScreen';
import BillingScreen from '../screens/BillingScreen';
import AuditScreen from '../screens/AuditScreen';
import WhatsAppConnectScreen from '../screens/WhatsAppConnectScreen';
import type { AgendaStackParamList, CrmStackParamList, HomeStackParamList, InboxStackParamList, MoreStackParamList } from './types';

const Tabs = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const CrmStack = createNativeStackNavigator<CrmStackParamList>();
const InboxStack = createNativeStackNavigator<InboxStackParamList>();
const AgendaStack = createNativeStackNavigator<AgendaStackParamList>();
const MoreStack = createNativeStackNavigator<MoreStackParamList>();

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="Home" component={HomeScreen} />
    </HomeStack.Navigator>
  );
}

function CrmStackNavigator() {
  return (
    <CrmStack.Navigator screenOptions={{ headerShown: false }}>
      <CrmStack.Screen name="Leads" component={LeadsScreen} />
      <CrmStack.Screen name="LeadDetail" component={LeadDetailScreen} />
      <CrmStack.Screen name="Pipeline" component={PipelineScreen} />
      <CrmStack.Screen name="Companies" component={CompaniesScreen} />
      <CrmStack.Screen name="Contacts" component={ContactsScreen} />
      <CrmStack.Screen name="Prospecting" component={ProspectingScreen} />
    </CrmStack.Navigator>
  );
}

function InboxStackNavigator() {
  return (
    <InboxStack.Navigator screenOptions={{ headerShown: false }}>
      <InboxStack.Screen name="Inbox" component={InboxScreen} />
      <InboxStack.Screen name="Conversation" component={ConversationScreen} />
    </InboxStack.Navigator>
  );
}

function AgendaStackNavigator() {
  return (
    <AgendaStack.Navigator screenOptions={{ headerShown: false }}>
      <AgendaStack.Screen name="Calendar" component={CalendarScreen} />
    </AgendaStack.Navigator>
  );
}

function MoreStackNavigator() {
  return (
    <MoreStack.Navigator screenOptions={{ headerShown: false }}>
      <MoreStack.Screen name="More" component={MoreScreen} />
      <MoreStack.Screen name="Analytics" component={AnalyticsScreen} />
      <MoreStack.Screen name="Campaigns" component={CampaignsScreen} />
      <MoreStack.Screen name="AIAgents" component={AIAgentsScreen} />
      <MoreStack.Screen name="Integrations" component={IntegrationsScreen} />
      <MoreStack.Screen name="WhiteLabel" component={WhiteLabelScreen} />
      <MoreStack.Screen name="Team" component={TeamScreen} />
      <MoreStack.Screen name="ApiKeys" component={ApiKeysScreen} />
      <MoreStack.Screen name="Webhooks" component={WebhooksScreen} />
      <MoreStack.Screen name="Billing" component={BillingScreen} />
      <MoreStack.Screen name="Audit" component={AuditScreen} />
      <MoreStack.Screen name="WhatsAppConnect" component={WhatsAppConnectScreen} />
      <MoreStack.Screen name="Profile" component={ProfileScreen} />
    </MoreStack.Navigator>
  );
}

function AppTabs() {
  const { theme } = useAuth();
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.brand,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border, height: 84, paddingTop: 8, paddingBottom: 22 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="HomeTab" component={HomeStackNavigator} options={{ tabBarLabel: 'Início', tabBarIcon: ({ color }) => <Icon name="dashboard" size={21} color={color} /> }} />
      <Tabs.Screen name="CrmTab" component={CrmStackNavigator} options={{ tabBarLabel: 'CRM', tabBarIcon: ({ color }) => <Icon name="crm" size={21} color={color} /> }} />
      <Tabs.Screen name="InboxTab" component={InboxStackNavigator} options={{ tabBarLabel: 'Inbox', tabBarIcon: ({ color }) => <Icon name="inbox" size={21} color={color} /> }} />
      <Tabs.Screen name="AgendaTab" component={AgendaStackNavigator} options={{ tabBarLabel: 'Agenda', tabBarIcon: ({ color }) => <Icon name="calendar" size={21} color={color} /> }} />
      <Tabs.Screen name="MoreTab" component={MoreStackNavigator} options={{ tabBarLabel: 'Mais', tabBarIcon: ({ color }) => <Icon name="more" size={21} color={color} /> }} />
    </Tabs.Navigator>
  );
}

export default function RootNavigator() {
  const { ready, user, theme } = useAuth();

  const navTheme = {
    ...(theme.mode === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(theme.mode === 'dark' ? DarkTheme.colors : DefaultTheme.colors),
      background: theme.bg,
      card: theme.card,
      text: theme.text,
      border: theme.border,
      primary: theme.brand,
    },
  };

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg }}>
        <ActivityIndicator color={theme.brand} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {user ? <AppTabs /> : <LoginScreen />}
    </NavigationContainer>
  );
}
